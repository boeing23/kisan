/**
 * Alert repository + idempotency helper. The scheduler may run repeatedly;
 * `alertExistsToday` prevents spamming a farmer with the same alert kind.
 */
import type { Alert } from "@kisan/core";
import { firestore, Collections } from "./client.js";

export async function saveAlert(alert: Alert): Promise<void> {
  await firestore().collection(Collections.alerts).doc(alert.id).set(alert);
}

export async function markDispatched(
  alertId: string,
  dispatchRef: string
): Promise<void> {
  await firestore().collection(Collections.alerts).doc(alertId).update({
    dispatchedAt: new Date().toISOString(),
    dispatchRef,
  });
}

/**
 * Idempotency marker per (field, kind, day). Using a deterministic doc id means
 * the daily scheduler can check "already sent today?" with a single doc read —
 * no composite index, no range query.
 */
const dayMarkerId = (fieldId: string, kind: Alert["kind"], isoDate: string) =>
  `${fieldId}_${kind}_${isoDate}`;

/** True if an alert of this kind was already sent for the field today. */
export async function alertExistsToday(
  fieldId: string,
  kind: Alert["kind"],
  isoDate: string // YYYY-MM-DD
): Promise<boolean> {
  const doc = await firestore()
    .collection(Collections.alertDays)
    .doc(dayMarkerId(fieldId, kind, isoDate))
    .get();
  return doc.exists;
}

/** Record that an alert of this kind was sent for the field today. */
export async function markAlertSent(
  fieldId: string,
  kind: Alert["kind"],
  isoDate: string
): Promise<void> {
  await firestore()
    .collection(Collections.alertDays)
    .doc(dayMarkerId(fieldId, kind, isoDate))
    .set({ fieldId, kind, isoDate, at: new Date().toISOString() });
}

/** Recent alerts for a farmer — for the officer dashboard + IVR history. */
export async function recentAlerts(
  farmerId: string,
  limit = 20
): Promise<Alert[]> {
  const snap = await firestore()
    .collection(Collections.alerts)
    .where("farmerId", "==", farmerId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as Alert);
}
