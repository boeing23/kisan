/**
 * Advisory message templates per language. Kept as fill-in templates (not LLM)
 * so dry-spell alerts are deterministic, cheap, and work offline for SMS/TTS.
 *
 * The `lang/` package can translate dynamically later; these cover the pilot
 * languages (Marathi, Telugu) plus Hindi/English fallback.
 */
import type { LanguageCode, Severity } from "@kisan/core";
import type { DrySpellResult } from "./dry-spell.js";

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
