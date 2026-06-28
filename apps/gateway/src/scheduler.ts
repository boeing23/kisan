/**
 * Advisory scheduler — the core daily loop, run by Cloud Scheduler.
 *
 * For every registered field it builds the full advisory (irrigation,
 * fertilization, dry-spell) and dispatches an alert for each actionable item.
 * Every alert kind is idempotent per field per day, so re-runs don't spam.
 */
import { randomUUID } from "node:crypto";
import type { Alert, Farmer, Field, LanguageCode } from "@kisan/core";
import { listFarmers, saveAlert, alertExistsToday, markAlertSent } from "@kisan/db";
import { dispatchAlert, type MessageProvider } from "./dispatch.js";
import { buildAdvisory } from "./advisory.js";
import type { SignalSources } from "./signals.js";

export interface AdvisoryRunResult {
  fieldsChecked: number;
  alertsCreated: number;
  alertsSkipped: number;
  byKind: Record<string, number>;
}

/** ISO date (YYYY-MM-DD) in IST — the day key for idempotency. */
function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function runAdvisoryJob(
  sources: SignalSources,
  messenger: MessageProvider
): Promise<AdvisoryRunResult> {
  const farmers = await listFarmers();
  const day = todayIST();
  const result: AdvisoryRunResult = {
    fieldsChecked: 0,
    alertsCreated: 0,
    alertsSkipped: 0,
    byKind: {},
  };

  for (const farmer of farmers) {
    for (const field of farmer.fields) {
      result.fieldsChecked++;
      const advisory = await buildAdvisory(field, farmer.language, sources);

      // Collect the actionable items into (kind, message, severity) tuples.
      const items: Array<{ kind: Alert["kind"]; message: string; severity: Alert["severity"] }> = [];
      if (advisory.drySpell.detected)
        items.push({ kind: "dry_spell", message: advisory.messages.drySpell, severity: advisory.drySpell.severity });
      if (advisory.irrigation.irrigate)
        items.push({ kind: "irrigation", message: advisory.messages.irrigation, severity: advisory.irrigation.severity });
      if (advisory.fertilization.due)
        items.push({ kind: "fertilization", message: advisory.messages.fertilization, severity: "advisory" });

      for (const item of items) {
        if (await alertExistsToday(field.id, item.kind, day)) {
          result.alertsSkipped++;
          continue;
        }
        const alert = buildAlert(farmer, field, item.kind, item.message, item.severity);
        await saveAlert(alert);
        await dispatchAlert(alert, farmer.phone, messenger);
        await markAlertSent(field.id, item.kind, day);
        result.alertsCreated++;
        result.byKind[item.kind] = (result.byKind[item.kind] ?? 0) + 1;
      }
    }
  }

  return result;
}

function buildAlert(
  farmer: Farmer,
  field: Field,
  kind: Alert["kind"],
  message: string,
  severity: Alert["severity"]
): Alert {
  return {
    id: randomUUID(),
    farmerId: farmer.id,
    fieldId: field.id,
    kind,
    severity,
    message,
    language: farmer.language as LanguageCode,
    channel: "sms",
    createdAt: new Date().toISOString(),
    dispatchedAt: null,
  };
}
