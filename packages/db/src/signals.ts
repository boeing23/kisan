/**
 * Per-field-per-day cache of assembled reco signals. Earth Engine + SoilGrids
 * calls are slow (~2–4 s) and quota-metered, and the underlying data changes
 * slowly, so caching by (fieldId, date) keeps the reco endpoint fast and cheap.
 */
import type { RecoSignals } from "@kisan/core";
import { firestore, Collections } from "./client.js";

interface CachedSignals {
  fieldId: string;
  date: string; // YYYY-MM-DD
  signals: RecoSignals;
  cachedAt: string;
}

const docId = (fieldId: string, date: string) => `${fieldId}_${date}`;

export async function getCachedSignals(
  fieldId: string,
  date: string
): Promise<RecoSignals | null> {
  const doc = await firestore()
    .collection(Collections.signalCache)
    .doc(docId(fieldId, date))
    .get();
  return doc.exists ? (doc.data() as CachedSignals).signals : null;
}

export async function saveCachedSignals(
  fieldId: string,
  date: string,
  signals: RecoSignals
): Promise<void> {
  const entry: CachedSignals = {
    fieldId,
    date,
    signals,
    cachedAt: new Date().toISOString(),
  };
  await firestore()
    .collection(Collections.signalCache)
    .doc(docId(fieldId, date))
    .set(entry);
}
