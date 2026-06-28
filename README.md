# 🌾 Kisan Alert — Smart Water, Crop & Advisory System

Voice/SMS agricultural intelligence for small & marginal farmers in Indic
languages. Helps farmers pick the right crop, warns them about dry spells, and
diagnoses crop disease from a photo or voice note — routed to extension officers
(Rythu Seva Kendra / Krishi Vigyan Kendra) for follow-up.

Pilot regions: **Maharashtra (Marathi)** and **Telangana (Telugu)**.

## What it does

1. **Crop recommendation** — ranks crops for a farmer's field from rainfall,
   soil moisture, groundwater & NDVI, with plain-language reasons.
2. **Dry-spell alerts** — a daily job checks each field's forecast and pushes a
   localized irrigation advisory when a dry spell is coming.
3. **Crop-health diagnosis** — a photo or voice complaint → Gemini multimodal →
   structured diagnosis + advice; serious cases escalate to an officer.

## Stack (all Google, TypeScript-only — zero Python)

| Concern | Tech |
|---|---|
| Backend | TypeScript on **Cloud Run** (Express) |
| App data | **Firestore** (`kisan-db`, native) |
| Weather | **Open-Meteo** (free, no key) |
| Satellite NDVI / soil moisture | **Earth Engine** (JS client, server-side compute) |
| Vision/voice diagnosis | **Gemini** (`gemini-2.5-flash`) |
| Speech / TTS / translate | **Google Cloud Speech, Text-to-Speech, Translation** |
| Officer console | **Firebase Hosting** + **Maps Platform** |
| Scheduling | **Cloud Scheduler** |

## Monorepo layout

```
packages/
  core/       domain types + config (reads secrets/)
  advisory/   dry-spell rules engine + localized messages   [8 unit tests]
  data/       Open-Meteo weather connector (WeatherProvider)
  reco/       crop knowledge base + scoring + Earth Engine NDVI sampler
  diagnosis/  Gemini multimodal crop-health diagnosis
  lang/       Google Speech / TTS / Translation (Bhashini-swappable interface)
  db/         Firestore client + repositories (farmers, alerts, diagnoses)
apps/
  gateway/    Express on Cloud Run — webhooks, dry-spell job, reco, diagnose
  dashboard/  static officer console (Firebase Hosting + Maps)
```

## Status — verified live

- ✅ Dry-spell engine (8 unit tests) + real Open-Meteo forecast → Marathi/Telugu message
- ✅ **Smart crop reco with real signals** — Earth Engine NDVI (Sentinel-2) +
  soil moisture (SMAP) + SoilGrids pH/soil-type + CGWB groundwater + Open-Meteo
  seasonal-rainfall archive, assembled per field, cached per day in Firestore.
  Beed → NDVI 0.14, SM 0.19, pH 7.3, GW 9 m, 1076 mm → drought-hardy crops top.
- ✅ Gemini diagnosis (voice → bollworm, Marathi advice, KVK escalation)
- ✅ Google Translate + Text-to-Speech (Marathi neural voice)
- ✅ Firestore read/write/delete on `kisan-db`
- ✅ Gateway end-to-end: SMS registration flow → reco → dry-spell job → diagnose
- ✅ Farmer phone simulator (`apps/simulator/`) drives the live gateway
- ⏳ Speech-to-Text — wired, not yet exercised with real audio

## Run locally

```bash
npm install
npm run build
npm test                                   # advisory unit tests
node apps/gateway/dist/server.js           # gateway on :8080
```

Secrets live in `secrets/` (gitignored): `service-account.json` + `keys.txt`
(`maps=…`, `gemini=…`). Config is read by `@kisan/core`.

### Try the gateway

```bash
# Register a farmer over "SMS"
curl -sX POST localhost:8080/webhook/sms -d '{"from":"+919812345678"}' -H 'content-type: application/json'
curl -sX POST localhost:8080/webhook/sms -d '{"from":"+919812345678","text":"1"}' -H 'content-type: application/json'   # Marathi
# ...name, state, crop...

curl -s localhost:8080/reco/farmer-919812345678          # crop recommendation
curl -sX POST localhost:8080/jobs/dry-spell              # run the alert loop
curl -sX POST localhost:8080/diagnose -d '{"farmerId":"farmer-919812345678","voiceTranscript":"leaves have holes"}' -H 'content-type: application/json'
```

## Deploy

```bash
# Gateway → Cloud Run + daily dry-spell scheduler
bash deploy/deploy.sh
# Officer dashboard → Firebase Hosting (+ Firestore rules)
cp apps/dashboard/public/config.example.js apps/dashboard/public/config.js   # fill in
firebase deploy --only hosting,firestore:rules
```

GCP setup (one-time): enable Firestore, Translation, Text-to-Speech,
Speech-to-Text, Earth Engine, Maps APIs; create the `kisan-db` Firestore
database; register the project for Earth Engine (non-commercial).

## Notes / next steps

- Telephony is **mocked** (`MockMessageProvider`) — swap for Exotel/Gupshup
  (DLT-registered) by implementing `MessageProvider`.
- Conversation sessions are in-memory — move to Firestore/Redis for multi-instance.
- `lang/` is an interface; a Bhashini implementation can replace `GoogleLang`
  for better rural dialect coverage.
- Field location defaults to a district centroid at registration — capture real
  GPS/SMS coordinates for accurate weather/NDVI.
