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
 * True if an alert of this kind was already created for the field today.
 * Keeps the daily scheduler idempotent.
 */
export async function alertExistsToday(
  fieldId: string,
  kind: Alert["kind"],
  isoDate: string // YYYY-MM-DD
): Promise<boolean> {
  const start = `${isoDate}T00:00:00.000Z`;
  const end = `${isoDate}T23:59:59.999Z`;
  const snap = await firestore()
    .collection(Collections.alerts)
    .where("fieldId", "==", fieldId)
    .where("kind", "==", kind)
    .where("createdAt", ">=", start)
    .where("createdAt", "<=", end)
    .limit(1)
    .get();
  return !snap.empty;
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
