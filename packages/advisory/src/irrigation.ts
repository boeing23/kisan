/**
 * Irrigation advisory — a soil-water-balance model. Pure, unit-testable.
 *
 * Idea: track available water in the root zone over a short horizon.
 *   available(day) = available(day-1) + rain(day) - cropDemand(day)
 *   cropDemand     = Kc × ET0   (crop evapotranspiration)
 * When available water is projected to fall below a stress threshold, recommend
 * irrigation; the amount refills the root zone to field capacity.
 *
 * Soil moisture comes from a ground sensor when fresh, else satellite (SMAP).
 */
import type { Severity } from "@kisan/core";
import type { Forecast } from "./weather.js";

/** Plant-available water capacity of the root zone (mm) by soil class. */
const ROOT_ZONE_MM: Record<string, number> = {
  sandy: 35,
  loam: 50,
  clay: 60,
  black: 65, // regur holds the most
};
const DEFAULT_ROOT_ZONE_MM = 50;

/** Fallback ET0 (mm/day) when the forecast doesn't supply it (kharif Deccan). */
const DEFAULT_ET0 = 5;
/** Irrigate when projected available water drops below this fraction of capacity. */
const STRESS_FRACTION = 0.4;

export interface IrrigationInput {
  forecast: Forecast;
  /** Current volumetric soil moisture 0..1 (sensor preferred, else satellite). */
  soilMoisture?: number;
  soilType?: string;
  /** Crop coefficient Kc (stage-dependent). Defaults to mid-season ~1.0. */
  cropCoefficient?: number;
  /** Days to look ahead. */
  horizonDays?: number;
}

export interface IrrigationAdvice {
  irrigate: boolean;
  /** Recommended depth to apply, mm (0 if not irrigating). */
  amountMm: number;
  /** Days until irrigation is needed (0 = today). */
  inDays: number;
  severity: Severity;
  /** Projected available water at horizon end, mm (for transparency). */
  projectedDeficitMm: number;
}

export function adviseIrrigation(input: IrrigationInput): IrrigationAdvice {
  const horizon = input.horizonDays ?? 7;
  const kc = input.cropCoefficient ?? 1.0;
  const capacity = ROOT_ZONE_MM[input.soilType ?? ""] ?? DEFAULT_ROOT_ZONE_MM;
  const stressLevel = capacity * STRESS_FRACTION;

  // Start of horizon: fraction of capacity currently filled.
  // soilMoisture 0..1 is treated as the fill fraction of plant-available water.
  let available = (input.soilMoisture ?? 0.5) * capacity;

  let inDays = horizon;
  let crossedStress = false;
  let availableAtStress = available;

  const days = input.forecast.days.slice(0, horizon);
  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    const demand = (day.et0Mm ?? DEFAULT_ET0) * kc;
    available = Math.min(capacity, available + day.rainfallMm - demand);
    if (!crossedStress && available < stressLevel) {
      crossedStress = true;
      inDays = i;
      availableAtStress = available;
    }
  }

  if (!crossedStress) {
    return { irrigate: false, amountMm: 0, inDays: horizon, severity: "info", projectedDeficitMm: 0 };
  }

  // Refill the root zone from its level at the stress point back to field capacity.
  const projectedDeficitMm = Math.max(0, capacity - availableAtStress);
  const amountMm = Math.round(projectedDeficitMm);
  return {
    irrigate: true,
    amountMm,
    inDays,
    severity: severityFor(inDays),
    projectedDeficitMm,
  };
}

/** Sooner the need, higher the urgency. */
function severityFor(inDays: number): Severity {
  if (inDays <= 1) return "warning";
  if (inDays <= 3) return "advisory";
  return "info";
}
