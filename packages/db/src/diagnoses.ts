/**
 * Diagnosis repository + officer follow-up workflow.
 *
 * Queries are intentionally single-field (then filtered/sorted in memory) to
 * avoid Firestore composite indexes at prototype scale.
 */
import type { Diagnosis } from "@kisan/core";
import { firestore, Collections } from "./client.js";

export async function saveDiagnosis(d: Diagnosis): Promise<void> {
  await firestore().collection(Collections.diagnoses).doc(d.id).set(d);
}

export async function getDiagnosis(id: string): Promise<Diagnosis | null> {
  const doc = await firestore().collection(Collections.diagnoses).doc(id).get();
  return doc.exists ? (doc.data() as Diagnosis) : null;
}

/** Recent diagnoses for a farmer, newest first (for recurrence context). */
export async function recentDiagnoses(farmerId: string, limit = 5): Promise<Diagnosis[]> {
  const snap = await firestore()
    .collection(Collections.diagnoses)
    .where("farmerId", "==", farmerId)
    .get();
  return snap.docs
    .map((d) => d.data() as Diagnosis)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/**
 * Open officer queue for a target (RSK / KVK): escalated, not yet resolved,
 * newest first.
 */
export async function listOfficerCases(officerTarget: string, limit = 50): Promise<Diagnosis[]> {
  const snap = await firestore()
    .collection(Collections.diagnoses)
    .where("officerTarget", "==", officerTarget)
    .get();
  return snap.docs
    .map((d) => d.data() as Diagnosis)
    .filter((d) => d.escalated && d.status !== "resolved")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/** Officer claims a case. */
export async function claimDiagnosis(id: string, officer: string): Promise<void> {
  await firestore().collection(Collections.diagnoses).doc(id).update({
    status: "claimed",
    assignedOfficer: officer,
  });
}

/** Officer records expert advice (status -> responded). */
export async function respondDiagnosis(
  id: string,
  officer: string,
  response: string
): Promise<void> {
  await firestore().collection(Collections.diagnoses).doc(id).update({
    status: "responded",
    assignedOfficer: officer,
    officerResponse: response,
    respondedAt: new Date().toISOString(),
  });
}

/** Close the case. */
export async function resolveDiagnosis(id: string): Promise<void> {
  await firestore().collection(Collections.diagnoses).doc(id).update({
    status: "resolved",
    resolvedAt: new Date().toISOString(),
  });
}

/** Open escalations for the realtime dashboard list, newest first. */
export async function listEscalated(limit = 50): Promise<Diagnosis[]> {
  const snap = await firestore()
    .collection(Collections.diagnoses)
    .where("escalated", "==", true)
    .get();
  return snap.docs
    .map((d) => d.data() as Diagnosis)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
