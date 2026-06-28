/**
 * Crop agronomy knowledge base for the pilot regions (Marathwada / Telangana).
 * Values are season-typical agronomy ranges, sourced from ICAR/state ag-dept
 * crop guides. Used by the rules engine to score suitability — not exhaustive,
 * but covers the dominant kharif/rabi crops of the two states.
 */
import type { LanguageCode } from "@kisan/core";

export type Season = "kharif" | "rabi" | "zaid";

export interface CropProfile {
  id: string;
  /** Display names per language for farmer-facing output. */
  names: Record<LanguageCode, string>;
  seasons: Season[];
  /** Seasonal water requirement, mm. Lower = more drought-friendly. */
  waterNeedMm: number;
  /** Suitable soil pH range [min, max]. */
  phRange: [number, number];
  /** 0..1 — tolerance to dry spells / low groundwater. */
  droughtTolerance: number;
  /** Min groundwater depth (m) below which irrigated crops get penalised. */
  maxGroundwaterDepthM: number;
  /** Preferred soil types (substring match on Soil Health Card type). */
  soilTypes: string[];
}

export const CROPS: CropProfile[] = [
  {
    id: "bajra",
    names: { "mr-IN": "बाजरी", "te-IN": "సజ్జలు", "hi-IN": "बाजरा", "en-IN": "Pearl millet" },
    seasons: ["kharif"],
    waterNeedMm: 350,
    phRange: [6.0, 8.5],
    droughtTolerance: 0.95,
    maxGroundwaterDepthM: 20,
    soilTypes: ["sandy", "loam", "light"],
  },
  {
    id: "jowar",
    names: { "mr-IN": "ज्वारी", "te-IN": "జొన్నలు", "hi-IN": "ज्वार", "en-IN": "Sorghum" },
    seasons: ["kharif", "rabi"],
    waterNeedMm: 400,
    phRange: [6.0, 8.5],
    droughtTolerance: 0.9,
    maxGroundwaterDepthM: 18,
    soilTypes: ["black", "loam", "clay"],
  },
  {
    id: "tur",
    names: { "mr-IN": "तूर", "te-IN": "కందులు", "hi-IN": "अरहर", "en-IN": "Pigeon pea" },
    seasons: ["kharif"],
    waterNeedMm: 450,
    phRange: [6.0, 7.5],
    droughtTolerance: 0.8,
    maxGroundwaterDepthM: 15,
    soilTypes: ["black", "loam"],
  },
  {
    id: "soybean",
    names: { "mr-IN": "सोयाबीन", "te-IN": "సోయాబీన్", "hi-IN": "सोयाबीन", "en-IN": "Soybean" },
    seasons: ["kharif"],
    waterNeedMm: 550,
    phRange: [6.0, 7.5],
    droughtTolerance: 0.5,
    maxGroundwaterDepthM: 12,
    soilTypes: ["black", "loam", "clay"],
  },
  {
    id: "cotton",
    names: { "mr-IN": "कापूस", "te-IN": "పత్తి", "hi-IN": "कपास", "en-IN": "Cotton" },
    seasons: ["kharif"],
    waterNeedMm: 700,
    phRange: [6.0, 8.0],
    droughtTolerance: 0.45,
    maxGroundwaterDepthM: 10,
    soilTypes: ["black", "clay"],
  },
  {
    id: "chickpea",
    names: { "mr-IN": "हरभरा", "te-IN": "శనగలు", "hi-IN": "चना", "en-IN": "Chickpea" },
    seasons: ["rabi"],
    waterNeedMm: 350,
    phRange: [6.0, 8.0],
    droughtTolerance: 0.75,
    maxGroundwaterDepthM: 15,
    soilTypes: ["black", "loam", "clay"],
  },
  {
    id: "rice",
    names: { "mr-IN": "भात", "te-IN": "వరి", "hi-IN": "धान", "en-IN": "Rice" },
    seasons: ["kharif"],
    waterNeedMm: 1200,
    phRange: [5.0, 7.0],
    droughtTolerance: 0.1,
    maxGroundwaterDepthM: 6,
    soilTypes: ["clay", "loam"],
  },
  {
    id: "maize",
    names: { "mr-IN": "मका", "te-IN": "మొక్కజొన్న", "hi-IN": "मक्का", "en-IN": "Maize" },
    seasons: ["kharif", "rabi"],
    waterNeedMm: 550,
    phRange: [5.5, 7.5],
    droughtTolerance: 0.4,
    maxGroundwaterDepthM: 10,
    soilTypes: ["loam", "black"],
  },
];

export function cropById(id: string): CropProfile | undefined {
  return CROPS.find((c) => c.id === id);
}
