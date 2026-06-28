/**
 * Core domain types for Kisan Alert.
 * Shared across all packages — single source of truth for the data model.
 */

/** Supported Indic languages (Google Speech/TTS/Translation language codes). */
export type LanguageCode = "mr-IN" | "te-IN" | "hi-IN" | "en-IN";

/** Pilot states for v1. Officer routing + datasets keyed off this. */
export type StateCode = "MH" | "TG"; // Maharashtra, Telangana

/** Geographic point (WGS84). */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/** A farmer's registered field/plot. */
export interface Field {
  id: string;
  /** Centroid of the plot — used for weather + satellite lookups. */
  location: GeoPoint;
  /** Approximate plot boundary (optional; centroid used if absent). */
  polygon?: GeoPoint[];
  areaHectares?: number;
  district: string;
  state: StateCode;
  /** Crop currently sown, if any. */
  currentCrop?: string;
  /** Soil type if known from Soil Health Card / SoilGrids. */
  soilType?: string;
  /** ISO date the current crop was sown — drives crop stage + fertilization. */
  sowingDate?: string;
}

/**
 * A reading from a ground soil-moisture/IoT sensor in a field. Sensor data,
 * when fresh, is preferred over satellite soil moisture for irrigation advice.
 */
export interface SensorReading {
  id: string;
  fieldId: string;
  deviceId: string;
  /** Volumetric soil moisture, 0..1. */
  soilMoisture: number;
  soilTempC?: number;
  /** ISO8601 timestamp of the reading. */
  timestamp: string;
}

/** A registered farmer (the primary user). */
export interface Farmer {
  id: string;
  /** E.164 phone, e.g. +9198XXXXXXXX. Primary identity for voice/SMS. */
  phone: string;
  name?: string;
  language: LanguageCode;
  state: StateCode;
  fields: Field[];
  createdAt: string; // ISO8601
}

/** Channels a farmer can be reached / reach the system on. */
export type Channel = "voice" | "sms" | "whatsapp";

/** Severity for advisories and diagnoses. */
export type Severity = "info" | "advisory" | "warning" | "critical";

/** An outbound alert/advisory dispatched to a farmer. */
export interface Alert {
  id: string;
  farmerId: string;
  fieldId: string;
  kind: "dry_spell" | "irrigation" | "fertilization" | "weather" | "diagnosis_followup";
  severity: Severity;
  /** Message in farmer's language, ready for TTS / SMS. */
  message: string;
  language: LanguageCode;
  channel: Channel;
  createdAt: string;
  /** null until dispatched. */
  dispatchedAt: string | null;
  /** Provider message id / mock id once sent. */
  dispatchRef?: string;
}

/** Result of the crop recommendation engine for one field. */
export interface CropRecommendation {
  fieldId: string;
  generatedAt: string;
  ranked: RankedCrop[];
  /** Signals that fed the recommendation, for transparency. */
  signals: RecoSignals;
}

export interface RankedCrop {
  crop: string;
  /** 0..1 suitability. */
  score: number;
  /** Short reason in farmer's language. */
  reason: string;
  /** Estimated water need, mm over season. */
  waterNeedMm?: number;
}

export interface RecoSignals {
  ndvi?: number;
  soilMoisture?: number;
  soilPh?: number;
  groundwaterDepthM?: number;
  seasonalRainfallMm?: number;
  season: "kharif" | "rabi" | "zaid";
}

/** A crop-health diagnosis from photo/voice. */
export interface Diagnosis {
  id: string;
  farmerId: string;
  fieldId: string;
  /** GCS path of submitted photo, if any. */
  photoRef?: string;
  /** Signed URL for the dashboard to render the photo. */
  photoUrl?: string;
  /** Transcribed voice complaint, if any. */
  voiceTranscript?: string;
  /** Model-identified issue. */
  label: string;
  confidence: number;
  severity: Severity;
  /** Advice in farmer's language. */
  advice: string;
  /** True if escalated to an extension officer. */
  escalated: boolean;
  /** RSK (Telangana) / KVK (Maharashtra) target id. */
  officerTarget?: string;
  createdAt: string;

  // --- Officer follow-up workflow ---
  /**
   * open       — AI diagnosis done, not yet picked up
   * claimed    — an officer is handling it
   * responded  — officer sent expert advice back to the farmer
   * resolved   — case closed
   * Non-escalated diagnoses stay "open" and are simply informational.
   */
  status: "open" | "claimed" | "responded" | "resolved";
  /** Officer who claimed the case. */
  assignedOfficer?: string;
  /** Expert advice the officer wrote (in any language; translated to farmer's). */
  officerResponse?: string;
  respondedAt?: string;
  resolvedAt?: string;
}

/**
 * Context passed to the diagnosis model so it reasons with the farmer's actual
 * crop, field, and history — not just the photo/sentence in isolation.
 */
export interface DiagnosisContext {
  crop?: string;
  district?: string;
  state?: StateCode;
  season?: "kharif" | "rabi" | "zaid";
  soilType?: string;
  /** Labels of recent diagnoses for this farmer (recurrence signal). */
  priorLabels?: string[];
}
