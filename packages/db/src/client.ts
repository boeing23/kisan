/**
 * Firestore client bootstrap. Uses the service-account credentials resolved by
 * @kisan/core config. Lazily initialised so importing this module is cheap and
 * doesn't require creds until a query actually runs.
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { config } from "@kisan/core";

let app: App | undefined;
let db: Firestore | undefined;

/** Get (or lazily create) the Firestore handle. */
export function firestore(): Firestore {
  if (db) return db;
  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0]!;
  } else {
    const sa = JSON.parse(readFileSync(config.serviceAccountPath, "utf8"));
    app = initializeApp({
      credential: cert(sa),
      projectId: config.projectId,
    });
  }
  db = getFirestore(app, config.firestoreDatabaseId);
  // Optional fields (photoRef, soilType, etc.) arrive as undefined; ignore them
  // rather than forcing every caller to strip keys before writing.
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

/** Firestore collection names — single source of truth. */
export const Collections = {
  farmers: "farmers",
  alerts: "alerts",
  diagnoses: "diagnoses",
  recommendations: "recommendations",
} as const;
