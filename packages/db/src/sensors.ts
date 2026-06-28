/**
 * Ground sensor readings repository. Each reading is stored, and the latest per
 * field is what the irrigation engine consults (preferred over satellite when
 * fresh). Doc id `${fieldId}_latest` keeps an O(1) latest-read lookup alongside
 * the append-only history.
 */
import type { SensorReading } from "@kisan/core";
import { firestore, Collections } from "./client.js";

/** Store a reading + update the per-field "latest" pointer. */
export async function saveSensorReading(reading: SensorReading): Promise<void> {
  const db = firestore();
  const col = db.collection(Collections.sensorReadings);
  await Promise.all([
    col.doc(reading.id).set(reading),
    col.doc(`${reading.fieldId}_latest`).set(reading),
  ]);
}

/** Latest reading for a field, or null. */
export async function getLatestReading(fieldId: string): Promise<SensorReading | null> {
  const doc = await firestore()
    .collection(Collections.sensorReadings)
    .doc(`${fieldId}_latest`)
    .get();
  return doc.exists ? (doc.data() as SensorReading) : null;
}

/** Latest reading if newer than `maxAgeHours`, else null (so callers fall back). */
export async function getFreshReading(
  fieldId: string,
  maxAgeHours = 24
): Promise<SensorReading | null> {
  const latest = await getLatestReading(fieldId);
  if (!latest) return null;
  const ageMs = Date.now() - new Date(latest.timestamp).getTime();
  return ageMs <= maxAgeHours * 3600 * 1000 ? latest : null;
}
