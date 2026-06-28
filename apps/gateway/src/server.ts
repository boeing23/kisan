/**
 * Kisan Alert gateway — Express app for Cloud Run.
 *
 * Routes:
 *   GET  /health              liveness
 *   POST /webhook/sms         inbound SMS/IVR turn -> conversation state machine
 *   POST /jobs/dry-spell      Cloud Scheduler trigger -> dry-spell alert loop
 *   GET  /reco/:farmerId      crop recommendation for a farmer's first field
 *   POST /diagnose            photo/voice crop-health diagnosis (Gemini)
 *
 * Sessions are held in-memory for the prototype (single instance). Move to
 * Firestore/Redis when scaling to multiple Cloud Run instances.
 */
import express, { type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { config } from "@kisan/core";
import type { Farmer } from "@kisan/core";
import {
  upsertFarmer,
  findFarmerByPhone,
  getFarmer,
  saveDiagnosis,
  saveSensorReading,
  recentDiagnoses,
  getDiagnosis,
  listOfficerCases,
  claimDiagnosis,
  respondDiagnosis,
  resolveDiagnosis,
  uploadPhoto,
  getSession,
  saveSession,
  saveAlert,
  listFarmers,
} from "@kisan/db";
import { OpenMeteoProvider, SoilGridsClient } from "@kisan/data";
import { recommendCrops, EarthEngineClient, currentSeason } from "@kisan/reco";
import { GeminiDiagnoser } from "@kisan/diagnosis";
import { GoogleLang } from "@kisan/lang";
import { runAdvisoryJob } from "./scheduler.js";
import { MockMessageProvider, dispatchAlert } from "./dispatch.js";
import { startSession, advance, type Session } from "./conversation.js";
import { buildFieldSignals, type SignalSources } from "./signals.js";
import { buildAdvisory } from "./advisory.js";

const app = express();
app.use(express.json({ limit: "12mb" }));

// CORS for the browser simulator/dashboard. Permissive for the prototype;
// restrict `Access-Control-Allow-Origin` to known hosts before any real deploy.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "content-type");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/** Wrap async route handlers so rejections reach the error middleware. */
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) =>
    fn(req, res).catch(next);

const weather = new OpenMeteoProvider();
const messenger = new MockMessageProvider();
const lang = new GoogleLang();

// Shared signal sources (EE auth is expensive — reuse one client).
const signalSources: SignalSources = {
  weather,
  soil: new SoilGridsClient(),
  earth: new EarthEngineClient(config.serviceAccountPath),
};

app.get("/health", (_req, res) => res.json({ ok: true, project: config.projectId }));

/**
 * Direct registration for the app UI. Body: { phone, name, language, state, crop }.
 * (The SMS/IVR path uses /webhook/sms; this is the smartphone-app equivalent.)
 */
app.post("/register", wrap(async (req: Request, res: Response) => {
  const { phone, name, language, state, crop } = req.body ?? {};
  if (!phone || !state) return res.status(400).json({ error: "phone and state required" });
  const digits = String(phone).replace(/\D/g, "");
  const loc = state === "MH" ? { lat: 18.99, lng: 75.76 } : { lat: 16.9, lng: 79.6 };
  const farmer = {
    id: `farmer-${digits}`,
    phone: String(phone),
    name: name ? String(name) : undefined,
    language: (language ?? "en-IN") as Farmer["language"],
    state: state as Farmer["state"],
    fields: [
      {
        id: `field-${digits}-1`,
        location: loc,
        district: state === "MH" ? "Beed" : "Nalgonda",
        state: state as Farmer["state"],
        currentCrop: crop ? String(crop) : undefined,
        sowingDate: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
  };
  await upsertFarmer(farmer);
  return res.json(farmer);
}));

/** Today's weather for a farmer's field (home strip). */
app.get("/weather/:farmerId", wrap(async (req: Request, res: Response) => {
  const farmer = await getFarmer(req.params.farmerId ?? "");
  if (!farmer || farmer.fields.length === 0)
    return res.status(404).json({ error: "farmer or field not found" });
  return res.json(await weather.getCurrentWeather(farmer.fields[0]!.location));
}));

/** Inbound SMS/IVR. Body: { from: E.164, text: string }. */
app.post("/webhook/sms", wrap(async (req: Request, res: Response) => {
  const { from, text } = req.body ?? {};
  if (!from) return res.status(400).json({ error: "missing 'from'" });

  const session = await getSession<Session>(from);
  // No session -> begin (or resume an already-registered farmer at the menu).
  if (!session) {
    const existing = await findFarmerByPhone(from);
    const turn = startSession(from);
    if (existing) turn.session.step = "registered_menu";
    await saveSession(from, turn.session);
    return res.json({ reply: turn.reply });
  }

  const turn = advance(session, String(text ?? ""));
  await saveSession(from, turn.session);
  if (turn.completedFarmer) await upsertFarmer(turn.completedFarmer);
  return res.json({ reply: turn.reply });
}));

/** Cloud Scheduler hits this daily — emits irrigation/fertilization/dry-spell alerts. */
app.post("/jobs/advisory", wrap(async (_req: Request, res: Response) => {
  const result = await runAdvisoryJob(signalSources, messenger);
  console.log("[advisory job]", JSON.stringify(result));
  return res.json(result);
}));

/** Crop recommendation for a farmer's first field. */
app.get("/reco/:farmerId", wrap(async (req: Request, res: Response) => {
  const farmer = await getFarmer(req.params.farmerId ?? "");
  if (!farmer || farmer.fields.length === 0)
    return res.status(404).json({ error: "farmer or field not found" });
  const field = farmer.fields[0]!;
  const force = req.query.force === "true";
  const signals = await buildFieldSignals(field, signalSources, force);
  const rec = recommendCrops(field.id, signals, farmer.language);
  return res.json(rec);
}));

/** Full advisory (irrigation + fertilization + dry-spell) for a farmer's field. */
app.get("/advisory/:farmerId", wrap(async (req: Request, res: Response) => {
  const farmer = await getFarmer(req.params.farmerId ?? "");
  if (!farmer || farmer.fields.length === 0)
    return res.status(404).json({ error: "farmer or field not found" });
  const advisory = await buildAdvisory(farmer.fields[0]!, farmer.language, signalSources);
  return res.json(advisory);
}));

/** Ingest a ground sensor reading. Body: { fieldId, deviceId, soilMoisture, soilTempC? }. */
app.post("/sensors/ingest", wrap(async (req: Request, res: Response) => {
  const { fieldId, deviceId, soilMoisture, soilTempC } = req.body ?? {};
  if (!fieldId || typeof soilMoisture !== "number")
    return res.status(400).json({ error: "fieldId and numeric soilMoisture required" });
  const reading = {
    id: randomUUID(),
    fieldId,
    deviceId: deviceId ?? "sim-device",
    soilMoisture,
    soilTempC,
    timestamp: new Date().toISOString(),
  };
  await saveSensorReading(reading);
  return res.json({ ok: true, reading });
}));

/** Diagnosis. Body: { farmerId, imageBase64?, imageMimeType?, voiceTranscript? }. */
app.post("/diagnose", wrap(async (req: Request, res: Response) => {
  const { farmerId, imageBase64, imageMimeType, voiceTranscript } = req.body ?? {};
  const farmer = farmerId ? await getFarmer(farmerId) : null;
  if (!farmer) return res.status(404).json({ error: "farmer not found" });
  const field = farmer.fields[0];

  // Build context from the farmer's field + recent diagnoses so the model
  // reasons in-situ, not just from the photo/sentence.
  const prior = await recentDiagnoses(farmer.id, 5);
  const diagnoser = new GeminiDiagnoser(
    config.geminiApiKey ?? (() => { throw new Error("GEMINI key missing"); })()
  );
  const out = await diagnoser.diagnose({
    imageBase64,
    imageMimeType,
    voiceTranscript,
    crop: field?.currentCrop,
    language: farmer.language,
    context: {
      crop: field?.currentCrop,
      district: field?.district,
      state: farmer.state,
      season: currentSeason(),
      soilType: field?.soilType,
      priorLabels: prior.map((d) => d.label),
    },
  });

  const id = randomUUID();
  // Persist the photo so an officer can review it later.
  let photoRef: string | undefined;
  let photoUrl: string | undefined;
  if (imageBase64) {
    const stored = await uploadPhoto(id, imageBase64, imageMimeType ?? "image/jpeg");
    photoRef = stored.ref;
    photoUrl = stored.url;
  }

  const diagnosis = {
    id,
    farmerId: farmer.id,
    fieldId: field?.id ?? "unknown",
    photoRef,
    photoUrl,
    voiceTranscript,
    label: out.label,
    confidence: out.confidence,
    severity: out.severity,
    advice: out.advice,
    escalated: out.recommendEscalation,
    officerTarget: farmer.state === "TG" ? "RSK" : "KVK",
    status: "open" as const,
    createdAt: new Date().toISOString(),
  };
  await saveDiagnosis(diagnosis);
  return res.json(diagnosis);
}));

// --- Officer follow-up loop (Rythu Seva Kendra / KVK) ---

/** List open escalated cases for an officer target. Query: ?target=RSK|KVK */
app.get("/officer/cases", wrap(async (req: Request, res: Response) => {
  const target = String(req.query.target ?? "");
  if (!target) return res.status(400).json({ error: "target query required (RSK|KVK)" });
  return res.json(await listOfficerCases(target));
}));

/** Officer claims a case. Body: { officer }. */
app.post("/officer/cases/:id/claim", wrap(async (req: Request, res: Response) => {
  const officer = String(req.body?.officer ?? "officer");
  await claimDiagnosis(req.params.id ?? "", officer);
  return res.json({ ok: true });
}));

/**
 * Officer sends expert advice. Body: { officer, response }.
 * The response is translated to the farmer's language and dispatched as a
 * follow-up alert — closing the loop back to the farmer.
 */
app.post("/officer/cases/:id/respond", wrap(async (req: Request, res: Response) => {
  const { officer, response } = req.body ?? {};
  if (!response) return res.status(400).json({ error: "response required" });
  const diag = await getDiagnosis(req.params.id ?? "");
  if (!diag) return res.status(404).json({ error: "case not found" });

  await respondDiagnosis(diag.id, String(officer ?? "officer"), String(response));

  const farmer = await getFarmer(diag.farmerId);
  if (farmer) {
    // Translate officer advice into the farmer's language, then dispatch.
    const localized =
      farmer.language === "en-IN"
        ? String(response)
        : await lang.translate(String(response), farmer.language, "en-IN");
    const alert = {
      id: randomUUID(),
      farmerId: farmer.id,
      fieldId: diag.fieldId,
      kind: "diagnosis_followup" as const,
      severity: "advisory" as const,
      message: localized,
      language: farmer.language,
      channel: "sms" as const,
      createdAt: new Date().toISOString(),
      dispatchedAt: null,
    };
    await saveAlert(alert);
    await dispatchAlert(alert, farmer.phone, messenger);
  }
  return res.json({ ok: true });
}));

/** Officer closes a case. */
app.post("/officer/cases/:id/resolve", wrap(async (req: Request, res: Response) => {
  await resolveDiagnosis(req.params.id ?? "");
  return res.json({ ok: true });
}));

/** Registered farmers (for the dashboard map). Trimmed to display fields. */
app.get("/farmers", wrap(async (_req: Request, res: Response) => {
  const farmers = await listFarmers();
  return res.json(
    farmers.map((f) => ({
      id: f.id,
      name: f.name ?? f.phone,
      state: f.state,
      language: f.language,
      fields: f.fields.map((fl) => ({
        location: fl.location,
        district: fl.district,
        currentCrop: fl.currentCrop,
      })),
    }))
  );
}));

/** Error middleware — log + return the message so failures are debuggable. */
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[gateway error]", err);
  res.status(500).json({ error: err.message });
});

const PORT = Number(process.env.PORT ?? 8080);
app.listen(PORT, () => console.log(`Kisan Alert gateway on :${PORT}`));

export { app };
