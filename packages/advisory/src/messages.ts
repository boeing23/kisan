/**
 * Advisory message templates per language. Kept as fill-in templates (not LLM)
 * so dry-spell alerts are deterministic, cheap, and work offline for SMS/TTS.
 *
 * The `lang/` package can translate dynamically later; these cover the pilot
 * languages (Marathi, Telugu) plus Hindi/English fallback.
 */
import type { LanguageCode, Severity } from "@kisan/core";
import type { DrySpellResult } from "./dry-spell.js";
import type { IrrigationAdvice } from "./irrigation.js";
import type { FertilizationAdvice, FertEvent } from "./fertilization.js";

interface Template {
  /** (days) => message */
  drySpell: (days: number, severity: Severity) => string;
}

const SEVERITY_PREFIX: Record<LanguageCode, Record<Severity, string>> = {
  "mr-IN": { info: "", advisory: "सूचना", warning: "इशारा", critical: "तातडीचा इशारा" },
  "te-IN": { info: "", advisory: "సూచన", warning: "హెచ్చరిక", critical: "అత్యవసర హెచ్చరిక" },
  "hi-IN": { info: "", advisory: "सूचना", warning: "चेतावनी", critical: "तत्काल चेतावनी" },
  "en-IN": { info: "", advisory: "Advisory", warning: "Warning", critical: "Urgent" },
};

const TEMPLATES: Record<LanguageCode, Template> = {
  "mr-IN": {
    drySpell: (d) =>
      `पुढील ${d} दिवस पाऊस नाही. पिकाला पाणी द्या आणि ओलावा टिकवा. खत देणे टाळा.`,
  },
  "te-IN": {
    drySpell: (d) =>
      `రాబోయే ${d} రోజులు వర్షం లేదు. పంటకు నీరు పెట్టండి, తేమ నిలుపుకోండి. ఎరువులు వేయవద్దు.`,
  },
  "hi-IN": {
    drySpell: (d) =>
      `अगले ${d} दिन बारिश नहीं। फसल को पानी दें और नमी बनाए रखें। खाद देना टालें।`,
  },
  "en-IN": {
    drySpell: (d) =>
      `No rain expected for ${d} days. Irrigate your crop and conserve soil moisture. Avoid fertiliser application.`,
  },
};

/** Build a farmer-ready dry-spell message in the given language. */
export function drySpellMessage(
  result: DrySpellResult,
  language: LanguageCode
): string {
  const tpl = TEMPLATES[language];
  const prefix = SEVERITY_PREFIX[language][result.severity];
  const body = tpl.drySpell(result.dryRunDays, result.severity);
  return prefix ? `${prefix}: ${body}` : body;
}

/** Irrigation message: when + how much to water (or that none is needed). */
export function irrigationMessage(advice: IrrigationAdvice, language: LanguageCode): string {
  const t = IRRIGATION[language];
  if (!advice.irrigate) return t.skip;
  const when = advice.inDays <= 0 ? t.today : t.inDays(advice.inDays);
  return `${SEVERITY_PREFIX[language][advice.severity] || t.label}: ${t.irrigate(when, advice.amountMm)}`;
}

/** Fertilization message for the dose due now. Empty string when none due. */
export function fertilizationMessage(advice: FertilizationAdvice, language: LanguageCode): string {
  if (!advice.due || !advice.action) return "";
  return FERTILIZER[language][advice.action];
}

const IRRIGATION: Record<LanguageCode, {
  label: string; skip: string; today: string;
  inDays: (n: number) => string; irrigate: (when: string, mm: number) => string;
}> = {
  "mr-IN": {
    label: "पाणी सल्ला", skip: "सध्या पुरेसा ओलावा आहे. पाणी देण्याची गरज नाही.",
    today: "आज", inDays: (n) => `${n} दिवसांत`,
    irrigate: (when, mm) => `${when} पिकाला पाणी द्या, सुमारे ${mm} मिमी.`,
  },
  "te-IN": {
    label: "నీటి సలహా", skip: "ప్రస్తుతం తగినంత తేమ ఉంది. నీరు అవసరం లేదు.",
    today: "ఈరోజు", inDays: (n) => `${n} రోజుల్లో`,
    irrigate: (when, mm) => `${when} పంటకు నీరు పెట్టండి, సుమారు ${mm} మిమీ.`,
  },
  "hi-IN": {
    label: "सिंचाई सलाह", skip: "अभी पर्याप्त नमी है. सिंचाई की जरूरत नहीं.",
    today: "आज", inDays: (n) => `${n} दिन में`,
    irrigate: (when, mm) => `${when} फसल को पानी दें, लगभग ${mm} मिमी.`,
  },
  "en-IN": {
    label: "Irrigation", skip: "Enough soil moisture for now. No irrigation needed.",
    today: "today", inDays: (n) => `in ${n} day(s)`,
    irrigate: (when, mm) => `Irrigate ${when}, about ${mm} mm.`,
  },
};

const FERTILIZER: Record<LanguageCode, Record<FertEvent["action"], string>> = {
  "mr-IN": {
    basal: "पेरणीच्या वेळी पायाभूत खत (NPK) द्या.",
    top_dress_1: "पहिली वरखत मात्रा — युरिया द्या.",
    top_dress_2: "दुसरी वरखत मात्रा — युरिया द्या.",
  },
  "te-IN": {
    basal: "విత్తే సమయంలో మూల ఎరువు (NPK) వేయండి.",
    top_dress_1: "మొదటి పైపాటు — యూరియా వేయండి.",
    top_dress_2: "రెండవ పైపాటు — యూరియా వేయండి.",
  },
  "hi-IN": {
    basal: "बुवाई के समय आधार खाद (NPK) दें.",
    top_dress_1: "पहली टॉप-ड्रेसिंग — यूरिया दें.",
    top_dress_2: "दूसरी टॉप-ड्रेसिंग — यूरिया दें.",
  },
  "en-IN": {
    basal: "Apply basal fertiliser (NPK) at sowing.",
    top_dress_1: "First top-dressing — apply urea.",
    top_dress_2: "Second top-dressing — apply urea.",
  },
};
