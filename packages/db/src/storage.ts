/**
 * Crop-photo storage in Google Cloud Storage. Photos submitted for diagnosis
 * are persisted so an extension officer can review what the farmer actually saw
 * (the AISDK only receives the bytes transiently). Returns a `gs://` ref stored
 * on the diagnosis, plus a signed URL the dashboard can render.
 */
import { getStorage } from "firebase-admin/storage";
import { firestore } from "./client.js"; // ensures the admin app is initialised
import { config } from "@kisan/core";

/** Upload base64 image bytes; returns { ref, url }. */
export async function uploadPhoto(
  diagnosisId: string,
  base64: string,
  contentType = "image/jpeg"
): Promise<{ ref: string; url: string }> {
  firestore(); // force admin app init before getStorage()
  const bucket = getStorage().bucket(config.photoBucket);
  const ext = contentType.includes("png") ? "png" : "jpg";
  const path = `diagnoses/${diagnosisId}.${ext}`;
  const file = bucket.file(path);

  await file.save(Buffer.from(base64, "base64"), {
    contentType,
    resumable: false,
  });

  // Long-lived signed URL for the officer dashboard to display.
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 365 * 24 * 3600 * 1000,
  });
  return { ref: `gs://${config.photoBucket}/${path}`, url };
}
