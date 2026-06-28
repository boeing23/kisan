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
