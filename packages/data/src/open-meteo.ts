/**
 * Open-Meteo weather connector. Free, no API key, global coverage.
 * Implements the WeatherProvider interface so the advisory engine is agnostic
 * to the source — swap for IMD/OpenWeather later without touching rules.
 *
 * Docs: https://open-meteo.com/en/docs
 */
import type { GeoPoint } from "@kisan/core";
import type { Forecast, DailyForecast, WeatherProvider } from "@kisan/advisory";

const BASE = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";

type Season = "kharif" | "rabi" | "zaid";

/** Month-day window for each Indian agricultural season. */
const SEASON_WINDOW: Record<Season, { start: [number, number]; end: [number, number] }> = {
  kharif: { start: [6, 1], end: [10, 31] },
  rabi: { start: [11, 1], end: [3, 31] }, // spans year boundary
  zaid: { start: [4, 1], end: [5, 31] },
};

interface ArchiveResponse {
  daily: { precipitation_sum: (number | null)[] };
}

interface OpenMeteoResponse {
  daily: {
    time: string[];
    precipitation_sum: number[];
    precipitation_probability_max: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    et0_fao_evapotranspiration?: number[];
  };
}

export class OpenMeteoProvider implements WeatherProvider {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async getForecast(location: GeoPoint, days: number): Promise<Forecast> {
    const params = new URLSearchParams({
      latitude: String(location.lat),
      longitude: String(location.lng),
      daily: [
        "precipitation_sum",
        "precipitation_probability_max",
        "temperature_2m_max",
        "temperature_2m_min",
        "et0_fao_evapotranspiration",
      ].join(","),
      forecast_days: String(Math.min(Math.max(days, 1), 16)),
      timezone: "Asia/Kolkata",
    });

    const res = await this.fetchFn(`${BASE}?${params}`);
    if (!res.ok) {
      throw new Error(`Open-Meteo error ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as OpenMeteoResponse;
    return mapResponse(location, json);
  }

  /**
   * Total rainfall (mm) over the most recently completed instance of a season,
   * from the historical archive. This is the climatic water budget a crop will
   * see — the right input for crop suitability (vs the 14-day forecast).
   * Returns undefined on failure so callers fall back to a neutral prior.
   */
  async getSeasonalRainfallMm(location: GeoPoint, season: Season, now = new Date()): Promise<number | undefined> {
    const { start, end } = lastCompletedSeason(season, now);
    const params = new URLSearchParams({
      latitude: String(location.lat),
      longitude: String(location.lng),
      start_date: start,
      end_date: end,
      daily: "precipitation_sum",
      timezone: "Asia/Kolkata",
    });
    try {
      const res = await this.fetchFn(`${ARCHIVE}?${params}`);
      if (!res.ok) return undefined;
      const json = (await res.json()) as ArchiveResponse;
      return json.daily.precipitation_sum.reduce<number>((s, v) => s + (v ?? 0), 0);
    } catch {
      return undefined;
    }
  }
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Compute the date range of the last fully-completed instance of `season`. */
function lastCompletedSeason(season: Season, now: Date): { start: string; end: string } {
  const w = SEASON_WINDOW[season];
  const year = now.getFullYear();
  const spansBoundary = w.start[0] > w.end[0]; // e.g. rabi Nov->Mar
  // Pick the latest end-date that is already in the past.
  let endYear = year;
  // If this year's season hasn't ended yet, step back a year.
  const thisEnd = new Date(now.getFullYear(), w.end[0] - 1, w.end[1]);
  if (thisEnd >= now) endYear = year - 1;
  const startYear = spansBoundary ? endYear - 1 : endYear;
  return {
    start: iso(startYear, w.start[0], w.start[1]),
    end: iso(endYear, w.end[0], w.end[1]),
  };
}

function mapResponse(location: GeoPoint, json: OpenMeteoResponse): Forecast {
  const d = json.daily;
  const days: DailyForecast[] = d.time.map((date, i) => ({
    date,
    rainfallMm: d.precipitation_sum[i] ?? 0,
    // API gives 0..100; normalise to 0..1.
    precipProbability: (d.precipitation_probability_max[i] ?? 0) / 100,
    tempMaxC: d.temperature_2m_max[i] ?? 0,
    tempMinC: d.temperature_2m_min[i] ?? 0,
    et0Mm: d.et0_fao_evapotranspiration?.[i],
  }));
  return { location, days, fetchedAt: new Date().toISOString() };
}
