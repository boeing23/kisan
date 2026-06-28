/**
 * Central config loader. Reads from environment first, then falls back to
 * the gitignored `secrets/` folder for local dev. Never hardcode keys.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Repo root = three levels up from packages/core/dist. */
const REPO_ROOT = resolve(__dirname, "../../..");
const SECRETS_DIR = resolve(REPO_ROOT, "secrets");

/** Parse a simple `key=value` file (secrets/keys.txt). Ignores blanks/comments. */
function parseKeysFile(): Record<string, string> {
  const path = resolve(SECRETS_DIR, "keys.txt");
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && val) out[key] = val;
  }
  return out;
}

const fileKeys = parseKeysFile();

function get(envName: string, fileName: string): string | undefined {
  return process.env[envName] ?? fileKeys[fileName];
}

export interface Config {
  projectId: string;
  serviceAccountPath: string;
  mapsApiKey?: string;
  geminiApiKey?: string;
  dataGovInApiKey?: string;
  /** Firestore database id. The console created a named db, not "(default)". */
  firestoreDatabaseId: string;
  /** True once Earth Engine access is approved for the project. */
  earthEngineEnabled: boolean;
}

export const config: Config = {
  projectId: process.env.GCP_PROJECT_ID ?? "kisan-alert-500812",
  serviceAccountPath:
    process.env.GOOGLE_APPLICATION_CREDENTIALS ??
    resolve(SECRETS_DIR, "service-account.json"),
  mapsApiKey: get("MAPS_API_KEY", "maps"),
  geminiApiKey: get("GEMINI_API_KEY", "gemini"),
  dataGovInApiKey: get("DATAGOVIN_API_KEY", "datagovin"),
  firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID ?? "kisan-db",
  earthEngineEnabled: process.env.EARTH_ENGINE_ENABLED === "true",
};

/** Throw if a required secret is missing — call at service startup, not import. */
export function requireKey(name: keyof Config): string {
  const val = config[name];
  if (!val || typeof val !== "string") {
    throw new Error(
      `Missing required config "${String(name)}". Set env or secrets/keys.txt.`
    );
  }
  return val;
}
