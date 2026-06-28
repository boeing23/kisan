/**
 * Gemini multimodal crop-health diagnosis.
 *
 * Takes a farmer's photo (and/or a transcribed voice complaint) plus context,
 * and returns a structured diagnosis. Uses JSON-schema-constrained output so
 * the result is machine-usable (severity routing, officer escalation) rather
 * than free text.
 */
import { GoogleGenAI, Type } from "@google/genai";
import type { LanguageCode, DiagnosisContext } from "@kisan/core";

const MODEL = "gemini-2.5-flash";

/** Raw structured result from the model (pre-DB-shaping). */
export interface DiagnosisOutput {
  label: string;
  confidence: number;
  severity: "info" | "advisory" | "warning" | "critical";
  /** Advice written in the requested language, simple words for low literacy. */
  advice: string;
  /** True if the model thinks an expert (RSK/KVK) should follow up. */
  recommendEscalation: boolean;
}

export interface DiagnoseInput {
  /** Base64-encoded image bytes (no data: prefix). */
  imageBase64?: string;
  imageMimeType?: string;
  /** Transcribed voice complaint, in any language. */
  voiceTranscript?: string;
  crop?: string;
  language: LanguageCode;
  /** Farmer/field/history context so the model reasons in situ. */
  context?: DiagnosisContext;
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    label: { type: Type.STRING, description: "Short name of disease/pest/deficiency, or 'healthy'." },
    confidence: { type: Type.NUMBER, description: "0..1 confidence." },
    severity: { type: Type.STRING, enum: ["info", "advisory", "warning", "critical"] },
    advice: { type: Type.STRING, description: "Actionable advice in the requested language, simple words." },
    recommendEscalation: { type: Type.BOOLEAN },
  },
  required: ["label", "confidence", "severity", "advice", "recommendEscalation"],
};

const LANG_NAME: Record<LanguageCode, string> = {
  "mr-IN": "Marathi",
  "te-IN": "Telugu",
  "hi-IN": "Hindi",
  "en-IN": "English",
};

export class GeminiDiagnoser {
  private readonly ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async diagnose(input: DiagnoseInput): Promise<DiagnosisOutput> {
    if (!input.imageBase64 && !input.voiceTranscript) {
      throw new Error("diagnose requires an image or a voice transcript");
    }

    const parts: Array<Record<string, unknown>> = [];
    if (input.imageBase64) {
      parts.push({
        inlineData: {
          mimeType: input.imageMimeType ?? "image/jpeg",
          data: input.imageBase64,
        },
      });
    }
    parts.push({ text: this.buildPrompt(input) });

    const response = await this.ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.2,
      },
    });

    const text = response.text;
    if (!text) throw new Error("Gemini returned no content");
    return JSON.parse(text) as DiagnosisOutput;
  }

  private buildPrompt(input: DiagnoseInput): string {
    const lang = LANG_NAME[input.language];
    const ctx = input.context;
    const crop = input.crop ?? ctx?.crop;
    const lines = [
      "You are an agricultural extension expert helping a small Indian farmer.",
      crop ? `The crop is ${crop}.` : "",
      ctx?.district || ctx?.state
        ? `Location: ${[ctx.district, ctx.state].filter(Boolean).join(", ")}, India.`
        : "",
      ctx?.season ? `Current season is ${ctx.season}.` : "",
      ctx?.soilType ? `Soil type is ${ctx.soilType}.` : "",
      ctx?.priorLabels?.length
        ? `This farmer's recent issues were: ${ctx.priorLabels.join(", ")} — consider whether the problem is recurring or worsening.`
        : "",
      input.voiceTranscript
        ? `The farmer describes the problem: "${input.voiceTranscript}".`
        : "",
      input.imageBase64
        ? "Examine the attached photo of the crop for disease, pest, or nutrient deficiency."
        : "",
      `Write the 'advice' field in ${lang} using simple words a low-literacy farmer understands.`,
      "Prefer locally-available, low-cost remedies suited to the region and season.",
      "Set recommendEscalation=true only if the issue is serious, ambiguous, or needs an on-site expert visit.",
      "If the plant looks healthy, label it 'healthy' with severity 'info'.",
    ];
    return lines.filter(Boolean).join(" ");
  }
}
