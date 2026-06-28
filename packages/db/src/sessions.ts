/**
 * Conversation session persistence. Sessions were in-memory (lost on restart,
 * broken across Cloud Run instances). Storing them in Firestore lets any
 * instance resume a farmer's call/SMS thread. Keyed by phone number.
 */
import { firestore, Collections } from "./client.js";

export async function getSession<T>(phone: string): Promise<T | null> {
  const doc = await firestore().collection(Collections.sessions).doc(phone).get();
  return doc.exists ? ((doc.data() as { session: T }).session ?? null) : null;
}

export async function saveSession<T>(phone: string, session: T): Promise<void> {
  await firestore()
    .collection(Collections.sessions)
    .doc(phone)
    .set({ session, updatedAt: new Date().toISOString() });
}

export async function clearSession(phone: string): Promise<void> {
  await firestore().collection(Collections.sessions).doc(phone).delete();
}
