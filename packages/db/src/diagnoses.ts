/**
 * Diagnosis repository. Escalated diagnoses surface on the officer dashboard
 * (RSK in Telangana / KVK in Maharashtra).
 */
import type { Diagnosis } from "@kisan/core";
import { firestore, Collections } from "./client.js";

export async function saveDiagnosis(d: Diagnosis): Promise<void> {
  await firestore().collection(Collections.diagnoses).doc(d.id).set(d);
}

/** Open escalations for an officer queue, newest first. */
export async function listEscalated(limit = 50): Promise<Diagnosis[]> {
  const snap = await firestore()
    .collection(Collections.diagnoses)
    .where("escalated", "==", true)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as Diagnosis);
}
