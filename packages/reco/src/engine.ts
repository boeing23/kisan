/**
 * Crop recommendation rules engine. Deterministic, explainable scoring of each
 * crop profile against a field's signals (satellite + soil + groundwater +
 * rainfall). No ML — transparent agronomy rules a farmer/officer can trust.
 *
 * Scoring combines four weighted sub-scores (water fit, pH fit, drought match,
 * groundwater fit), each 0..1, plus a season hard-filter.
 */
import type { CropRecommendation, RankedCrop, RecoSignals, LanguageCode } from "@kisan/core";
import { CROPS, type CropProfile } from "./crops.js";

const WEIGHTS = {
  water: 0.35,
  ph: 0.15,
  drought: 0.3,
  groundwater: 0.2,
} as const;

/** Clamp to [0,1]. */
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Water fit: if expected seasonal rainfall covers the crop's need, score high.
 * Deficit is penalised proportionally to how much irrigation must fill the gap.
 */
function waterScore(crop: CropProfile, signals: RecoSignals): number {
  const rain = signals.seasonalRainfallMm ?? crop.waterNeedMm; // neutral if unknown
  const ratio = rain / crop.waterNeedMm;
  // ratio >= 1 -> fully rain-fed (1.0); ratio 0.5 -> half deficit (0.5).
  return clamp01(ratio);
}

/** pH fit: 1.0 inside range, decaying outside. */
function phScore(crop: CropProfile, signals: RecoSignals): number {
  if (signals.soilPh === undefined) return 0.7; // mild neutral prior
  const [lo, hi] = crop.phRange;
  if (signals.soilPh >= lo && signals.soilPh <= hi) return 1;
  const dist = signals.soilPh < lo ? lo - signals.soilPh : signals.soilPh - hi;
  return clamp01(1 - dist / 2); // each pH unit outside costs 0.5
}

/**
 * Drought match: when soil moisture / rainfall is low, reward drought-tolerant
 * crops; when water is ample, tolerance matters less.
 */
function droughtScore(crop: CropProfile, signals: RecoSignals): number {
  const moisture = signals.soilMoisture ?? 0.4;
  // dryness 0..1: low moisture -> high dryness
  const dryness = clamp01(1 - moisture / 0.5);
  // Reward = tolerance when dry; near-neutral when wet.
  return clamp01(1 - dryness * (1 - crop.droughtTolerance));
}

/** Groundwater fit: deep water table penalises water-hungry/irrigated crops. */
function groundwaterScore(crop: CropProfile, signals: RecoSignals): number {
  if (signals.groundwaterDepthM === undefined) return 0.7;
  if (signals.groundwaterDepthM <= crop.maxGroundwaterDepthM) return 1;
  const over = signals.groundwaterDepthM - crop.maxGroundwaterDepthM;
  return clamp01(1 - over / crop.maxGroundwaterDepthM);
}

interface Scored {
  crop: CropProfile;
  score: number;
  parts: { water: number; ph: number; drought: number; groundwater: number };
}

function scoreCrop(crop: CropProfile, signals: RecoSignals): Scored {
  const parts = {
    water: waterScore(crop, signals),
    ph: phScore(crop, signals),
    drought: droughtScore(crop, signals),
    groundwater: groundwaterScore(crop, signals),
  };
  const score =
    parts.water * WEIGHTS.water +
    parts.ph * WEIGHTS.ph +
    parts.drought * WEIGHTS.drought +
    parts.groundwater * WEIGHTS.groundwater;
  return { crop, score, parts };
}

/** Build a short, human reason for why a crop scored as it did, per language. */
function buildReason(s: Scored, signals: RecoSignals, lang: LanguageCode): string {
  const strong: string[] = [];
  if (s.parts.drought >= 0.8 && (signals.soilMoisture ?? 0.4) < 0.3)
    strong.push(REASONS[lang].droughtHardy);
  if (s.parts.water >= 0.9) strong.push(REASONS[lang].rainSufficient);
  if (s.parts.groundwater >= 0.9) strong.push(REASONS[lang].lowWaterNeed);
  if (strong.length === 0) strong.push(REASONS[lang].balanced);
  return strong.join(" ");
}

interface ReasonStrings {
  droughtHardy: string;
  rainSufficient: string;
  lowWaterNeed: string;
  balanced: string;
}

const REASONS: Record<LanguageCode, ReasonStrings> = {
  "mr-IN": {
    droughtHardy: "कमी पाण्यातही टिकते.",
    rainSufficient: "पावसावर येते.",
    lowWaterNeed: "कमी पाणी लागते.",
    balanced: "तुमच्या जमिनीसाठी योग्य.",
  },
  "te-IN": {
    droughtHardy: "తక్కువ నీటిలోనూ నిలుస్తుంది.",
    rainSufficient: "వర్షాధారంగా పండుతుంది.",
    lowWaterNeed: "తక్కువ నీరు అవసరం.",
    balanced: "మీ నేలకు అనుకూలం.",
  },
  "hi-IN": {
    droughtHardy: "कम पानी में टिकती है.",
    rainSufficient: "बारिश पर होती है.",
    lowWaterNeed: "कम पानी चाहिए.",
    balanced: "आपकी मिट्टी के लिए उपयुक्त.",
  },
  "en-IN": {
    droughtHardy: "Survives with little water.",
    rainSufficient: "Rain-fed.",
    lowWaterNeed: "Needs little water.",
    balanced: "Suits your soil.",
  },
};

/**
 * Rank crops for a field. Hard-filters by season, scores the rest, returns the
 * top N with reasons and estimated water need.
 */
export function recommendCrops(
  fieldId: string,
  signals: RecoSignals,
  language: LanguageCode,
  topN = 4
): CropRecommendation {
  const inSeason = CROPS.filter((c) => c.seasons.includes(signals.season));
  const scored = inSeason
    .map((c) => scoreCrop(c, signals))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  const ranked: RankedCrop[] = scored.map((s) => ({
    crop: s.crop.names[language],
    score: Number(s.score.toFixed(3)),
    reason: buildReason(s, signals, language),
    waterNeedMm: s.crop.waterNeedMm,
  }));

  return {
    fieldId,
    generatedAt: new Date().toISOString(),
    ranked,
    signals,
  };
}
