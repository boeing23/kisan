/**
 * Farmer repository. Phone number is the natural key (E.164), but we store
 * under an auto doc id and index phone for lookup from voice/SMS webhooks.
 */
import type { Farmer } from "@kisan/core";
import { firestore, Collections } from "./client.js";

/** Create or overwrite a farmer record. */
export async function upsertFarmer(farmer: Farmer): Promise<void> {
  await firestore().collection(Collections.farmers).doc(farmer.id).set(farmer);
}

/** Look up a farmer by phone (the identity a webhook receives). */
export async function findFarmerByPhone(phone: string): Promise<Farmer | null> {
  const snap = await firestore()
    .collection(Collections.farmers)
    .where("phone", "==", phone)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0]!.data() as Farmer;
}

export async function getFarmer(id: string): Promise<Farmer | null> {
  const doc = await firestore().collection(Collections.farmers).doc(id).get();
  return doc.exists ? (doc.data() as Farmer) : null;
}

/** Stream all farmers — used by the dry-spell scheduler to fan out alerts. */
export async function listFarmers(): Promise<Farmer[]> {
  const snap = await firestore().collection(Collections.farmers).get();
  return snap.docs.map((d) => d.data() as Farmer);
}
