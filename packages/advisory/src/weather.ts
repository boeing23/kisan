/**
 * Weather forecast model. Provider-agnostic: a connector (IMD / OpenWeather)
 * maps its raw response into these shapes so the rules engine stays portable.
 */
import type { GeoPoint } from "@kisan/core";

/** One day of forecast for a location. */
export interface DailyForecast {
  /** ISO date (YYYY-MM-DD), local. */
  date: string;
  /** Expected rainfall, mm. */
  rainfallMm: number;
  /** Probability of precipitation, 0..1. */
  precipProbability: number;
  tempMaxC: number;
  tempMinC: number;
  /** Reference evapotranspiration, mm/day (if provider supplies it). */
  et0Mm?: number;
}

export interface Forecast {
  location: GeoPoint;
  /** Ordered ascending by date, starting today. */
  days: DailyForecast[];
  /** When this forecast was retrieved. */
  fetchedAt: string;
}

/** A weather provider any connector must implement. */
export interface WeatherProvider {
  /** Fetch an N-day daily forecast for a point. */
  getForecast(location: GeoPoint, days: number): Promise<Forecast>;
}
