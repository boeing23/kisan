/**
 * Dry-spell scheduler — the core advisory loop, run daily by Cloud Scheduler.
 *
 * For every registered farmer field: fetch the forecast, run the dry-spell
 * rules, and if an actionable spell is found (and not already alerted today),
 * create a localized alert and dispatch it. Idempotent per field per day.
 */
import { randomUUID } from "node:crypto";
import type { Alert, Farmer } from "@kisan/core";
import { listFarmers, saveAlert, alertExistsToday } from "@kisan/db";
import {
  detectDrySpell,
  drySpellMessage,
  type WeatherProvider,
} from "@kisan/advisory";
import { dispatchAlert, type MessageProvider } from "./dispatch.js";

export interface DrySpellRunResult {
  fieldsChecked: number;
  alertsCreated: number;
  alertsSkipped: number;
}

/** ISO date (YYYY-MM-DD) in IST — the day key for idempotency. */
function todayIST(): string {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
}

export async function runDrySpellJob(
  weather: WeatherProvider,
  messenger: MessageProvider,
  forecastDays = 14
): Promise<DrySpellRunResult> {
  const farmers = await listFarmers();
  const day = todayIST();
  let fieldsChecked = 0;
  let alertsCreated = 0;
  let alertsSkipped = 0;

  for (const farmer of farmers) {
    for (const field of farmer.fields) {
      fieldsChecked++;
      const forecast = await weather.getForecast(field.location, forecastDays);
      const result = detectDrySpell(forecast);
      if (!result.detected) continue;

      if (await alertExistsToday(field.id, "dry_spell", day)) {
        alertsSkipped++;
        continue;
      }

      const alert = buildAlert(farmer, field.id, result.dryRunDays, result.severity);
      await saveAlert(alert);
      await dispatchAlert(alert, farmer.phone, messenger);
      alertsCreated++;
    }
  }

  return { fieldsChecked, alertsCreated, alertsSkipped };
}

function buildAlert(
  farmer: Farmer,
  fieldId: string,
  dryRunDays: number,
  severity: Alert["severity"]
): Alert {
  return {
    id: randomUUID(),
    farmerId: farmer.id,
    fieldId,
    kind: "dry_spell",
    severity,
    message: drySpellMessage({ detected: true, dryRunDays, startDate: null, severity, soilEscalated: false }, farmer.language),
    language: farmer.language,
    channel: "sms",
    createdAt: new Date().toISOString(),
    dispatchedAt: null,
  };
}
