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
import {
  upsertFarmer,
  findFarmerByPhone,
  getFarmer,
  saveDiagnosis,
} from "@kisan/db";
import { OpenMeteoProvider, SoilGridsClient } from "@kisan/data";
import { recommendCrops, EarthEngineClient } from "@kisan/reco";
import { GeminiDiagnoser } from "@kisan/diagnosis";
import { runDrySpellJob } from "./scheduler.js";
import { MockMessageProvider } from "./dispatch.js";
import { startSession, advance, type Session } from "./conversation.js";
import { buildFieldSignals, type SignalSources } from "./signals.js";

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
const sessions = new Map<string, Session>();

// Shared signal sources (EE auth is expensive — reuse one client).
const signalSources: SignalSources = {
  weather,
  soil: new SoilGridsClient(),
  earth: new EarthEngineClient(config.serviceAccountPath),
};

app.get("/health", (_req, res) => res.json({ ok: true, project: config.projectId }));

/** Inbound SMS/IVR. Body: { from: E.164, text: string }. */
app.post("/webhook/sms", wrap(async (req: Request, res: Response) => {
  const { from, text } = req.body ?? {};
  if (!from) return res.status(400).json({ error: "missing 'from'" });

  let session = sessions.get(from);
  // No session + no text, or an explicit "hi"/"start" -> begin (or resume).
  if (!session) {
    const existing = await findFarmerByPhone(from);
    const turn = startSession(from);
    if (existing) turn.session.step = "registered_menu";
    sessions.set(from, turn.session);
    return res.json({ reply: turn.reply });
  }

  const turn = advance(session, String(text ?? ""));
  sessions.set(from, turn.session);
  if (turn.completedFarmer) await upsertFarmer(turn.completedFarmer);
  return res.json({ reply: turn.reply });
}));

/** Cloud Scheduler hits this daily. */
app.post("/jobs/dry-spell", wrap(async (_req: Request, res: Response) => {
  const result = await runDrySpellJob(weather, messenger);
  console.log("[dry-spell job]", JSON.stringify(result));
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

/** Diagnosis. Body: { farmerId, imageBase64?, imageMimeType?, voiceTranscript? }. */
app.post("/diagnose", wrap(async (req: Request, res: Response) => {
  const { farmerId, imageBase64, imageMimeType, voiceTranscript } = req.body ?? {};
  const farmer = farmerId ? await getFarmer(farmerId) : null;
  if (!farmer) return res.status(404).json({ error: "farmer not found" });
  const field = farmer.fields[0];

  const diagnoser = new GeminiDiagnoser(
    config.geminiApiKey ?? (() => { throw new Error("GEMINI key missing"); })()
  );
  const out = await diagnoser.diagnose({
    imageBase64,
    imageMimeType,
    voiceTranscript,
    crop: field?.currentCrop,
    language: farmer.language,
  });

  const diagnosis = {
    id: randomUUID(),
    farmerId: farmer.id,
    fieldId: field?.id ?? "unknown",
    photoRef: undefined,
    voiceTranscript,
    label: out.label,
    confidence: out.confidence,
    severity: out.severity,
    advice: out.advice,
    escalated: out.recommendEscalation,
    officerTarget: farmer.state === "TG" ? "RSK" : "KVK",
    createdAt: new Date().toISOString(),
  };
  await saveDiagnosis(diagnosis);
  return res.json(diagnosis);
}));

/** Error middleware — log + return the message so failures are debuggable. */
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[gateway error]", err);
  res.status(500).json({ error: err.message });
});

const PORT = Number(process.env.PORT ?? 8080);
app.listen(PORT, () => console.log(`Kisan Alert gateway on :${PORT}`));

export { app };
