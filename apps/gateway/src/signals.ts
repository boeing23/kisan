/**
 * Field-signals assembler — the composition point that turns a farmer's field
 * into the real `RecoSignals` the scoring engine consumes.
 *
 * Sources (all degrade gracefully — any failure leaves that signal undefined and
 * the engine uses a neutral prior):
 *   - Earth Engine  : ndvi (Sentinel-2), soilMoisture (SMAP)        [satellite]
 *   - SoilGrids     : soilPh, soilType                              [soil]
 *   - CGWB table    : groundwaterDepthM                             [groundwater]
 *   - Open-Meteo    : seasonalRainfallMm (historical archive)       [climate]
 *
 * Results are cached per field per day in Firestore (EE/SoilGrids are slow).
 */
import type { Field, RecoSignals } from "@kisan/core";
import { getCachedSignals, saveCachedSignals } from "@kisan/db";
import {
  OpenMeteoProvider,
  SoilGridsClient,
  groundwaterDepthM,
} from "@kisan/data";
import { EarthEngineClient, currentSeason } from "@kisan/reco";

export interface SignalSources {
  weather: OpenMeteoProvider;
  soil: SoilGridsClient;
  earth: EarthEngineClient;
}

/** YYYY-MM-DD in IST — the cache day key. */
function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Assemble (or load cached) signals for a field. Set `force` to bypass cache.
 */
export async function buildFieldSignals(
  field: Field,
  sources: SignalSources,
  force = false
): Promise<RecoSignals> {
  const day = todayIST();
  if (!force) {
    const cached = await getCachedSignals(field.id, day);
    if (cached) return cached;
  }

  const season = currentSeason();

  // Fetch every source in parallel; none may reject the whole assembly.
  const [earth, soil, rainfall] = await Promise.all([
    safe(() => sources.earth.sampleField(field.location, field.polygon), {}),
    safe(() => sources.soil.getSoil(field.location), {}),
    safe(() => sources.weather.getSeasonalRainfallMm(field.location, season), undefined),
  ]);

  const signals: RecoSignals = {
    season,
    ndvi: earth.ndvi,
    soilMoisture: earth.soilMoisture,
    soilPh: soil.soilPh,
    groundwaterDepthM: groundwaterDepthM(field.state, field.district),
    seasonalRainfallMm: rainfall,
  };

  await safe(() => saveCachedSignals(field.id, day, signals), undefined);
  return signals;
}

/** Run an async op, returning a fallback on any rejection. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn("[signals] source failed:", (err as Error).message);
    return fallback;
  }
}
