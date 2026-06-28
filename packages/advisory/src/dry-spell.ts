/**
 * Dry-spell detection — pure rules engine. No I/O, fully unit-testable.
 *
 * A "dry spell" for rain-fed agriculture: a run of consecutive days with
 * negligible rainfall, optionally aggravated by low soil moisture and high
 * evapotranspiration. Thresholds are agronomy defaults, tunable per crop/region.
 */
import type { Severity } from "@kisan/core";
import type { Forecast } from "./weather.js";

export interface DrySpellThresholds {
  /** A day counts as "dry" if rainfall is below this (mm). */
  dryDayRainMm: number;
  /** Consecutive dry days to raise an advisory. */
  advisoryDays: number;
  /** Consecutive dry days to raise a warning. */
  warningDays: number;
  /** Consecutive dry days to raise a critical alert. */
  criticalDays: number;
  /** If soil moisture (0..1) is below this, escalate one severity level. */
  lowSoilMoisture: number;
}

export const DEFAULT_THRESHOLDS: DrySpellThresholds = {
  dryDayRainMm: 2.5,
  advisoryDays: 5,
  warningDays: 7,
  criticalDays: 10,
  lowSoilMoisture: 0.2,
};

export interface DrySpellResult {
  /** True if any actionable dry spell detected. */
  detected: boolean;
  /** Longest run of dry days in the forecast window. */
  dryRunDays: number;
  /** First date of the detected dry run, if any. */
  startDate: string | null;
  severity: Severity;
  /** Soil-moisture escalation applied. */
  soilEscalated: boolean;
}

/** Map a dry-run length to a base severity using thresholds. */
function baseSeverity(dryRun: number, t: DrySpellThresholds): Severity {
  if (dryRun >= t.criticalDays) return "critical";
  if (dryRun >= t.warningDays) return "warning";
  if (dryRun >= t.advisoryDays) return "advisory";
  return "info";
}

const ORDER: Severity[] = ["info", "advisory", "warning", "critical"];

/** Bump severity up one level (capped at critical). */
function escalate(s: Severity): Severity {
  const i = ORDER.indexOf(s);
  return ORDER[Math.min(i + 1, ORDER.length - 1)]!;
}

/**
 * Detect the longest leading dry run in a forecast.
 * @param soilMoisture optional 0..1 current soil moisture for escalation.
 */
export function detectDrySpell(
  forecast: Forecast,
  soilMoisture?: number,
  thresholds: DrySpellThresholds = DEFAULT_THRESHOLDS
): DrySpellResult {
  let longestRun = 0;
  let runStart: string | null = null;
  let bestStart: string | null = null;
  let current = 0;

  for (const day of forecast.days) {
    if (day.rainfallMm < thresholds.dryDayRainMm) {
      if (current === 0) runStart = day.date;
      current++;
      if (current > longestRun) {
        longestRun = current;
        bestStart = runStart;
      }
    } else {
      current = 0;
      runStart = null;
    }
  }

  let severity = baseSeverity(longestRun, thresholds);
  const soilEscalated =
    soilMoisture !== undefined &&
    soilMoisture < thresholds.lowSoilMoisture &&
    severity !== "info";
  if (soilEscalated) severity = escalate(severity);

  return {
    detected: severity !== "info",
    dryRunDays: longestRun,
    startDate: bestStart,
    severity,
    soilEscalated,
  };
}
