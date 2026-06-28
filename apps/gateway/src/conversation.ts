/**
 * Conversational state machine for IVR/SMS registration + menu. Hand-built
 * (no Dialogflow) so it runs at $0 on Cloud Run. Pure transition function:
 * (session, input) -> { session, reply } — easy to unit test and to drive from
 * any channel (SMS body, IVR DTMF digit, or WhatsApp text).
 *
 * Localised prompts cover the pilot languages; English shown here inline as the
 * canonical copy — production would route all prompts through @kisan/lang TTS.
 */
import type { Farmer, Field, LanguageCode, StateCode } from "@kisan/core";

export type Step =
  | "start"
  | "choose_language"
  | "ask_name"
  | "ask_state"
  | "ask_crop"
  | "registered_menu"
  | "done";

export interface Session {
  phone: string;
  step: Step;
  draft: Partial<Farmer> & { fieldDraft?: Partial<Field> };
}

export interface Turn {
  session: Session;
  reply: string;
  /** Set when registration completes — caller persists the farmer. */
  completedFarmer?: Farmer;
}

const LANG_BY_DIGIT: Record<string, LanguageCode> = {
  "1": "mr-IN",
  "2": "te-IN",
  "3": "hi-IN",
};

const STATE_BY_DIGIT: Record<string, StateCode> = {
  "1": "MH",
  "2": "TG",
};

const PROMPTS = {
  chooseLanguage: "Welcome to Kisan Alert. Press 1 Marathi, 2 Telugu, 3 Hindi.",
  askName: { "mr-IN": "तुमचे नाव सांगा.", "te-IN": "మీ పేరు చెప్పండి.", "hi-IN": "अपना नाम बताएं.", "en-IN": "Tell us your name." },
  askState: { "mr-IN": "राज्य निवडा: 1 महाराष्ट्र, 2 तेलंगणा.", "te-IN": "రాష్ట్రం: 1 మహారాష్ట్ర, 2 తెలంగాణ.", "hi-IN": "राज्य चुनें: 1 महाराष्ट्र, 2 तेलंगाना.", "en-IN": "State: 1 Maharashtra, 2 Telangana." },
  askCrop: { "mr-IN": "सध्याचे पीक सांगा.", "te-IN": "ప్రస్తుత పంట చెప్పండి.", "hi-IN": "वर्तमान फसल बताएं.", "en-IN": "Tell us your current crop." },
  registered: { "mr-IN": "नोंदणी झाली! 1 पीक सल्ला, 2 हवामान इशारा, 3 पीक समस्या.", "te-IN": "నమోదు పూర్తి! 1 పంట సలహా, 2 వాతావరణ హెచ్చరిక, 3 పంట సమస్య.", "hi-IN": "पंजीकरण पूरा! 1 फसल सलाह, 2 मौसम चेतावनी, 3 फसल समस्या.", "en-IN": "Registered! 1 crop advice, 2 weather alerts, 3 crop problem." },
} as const;

/** Start a fresh session for a phone number. */
export function startSession(phone: string): Turn {
  const session: Session = { phone, step: "choose_language", draft: { phone } };
  return { session, reply: PROMPTS.chooseLanguage };
}

/** Advance the conversation given the farmer's raw input (digit or text). */
export function advance(session: Session, input: string): Turn {
  const text = input.trim();
  const lang = (session.draft.language ?? "en-IN") as LanguageCode;

  switch (session.step) {
    case "choose_language": {
      const chosen = LANG_BY_DIGIT[text];
      if (!chosen) return same(session, PROMPTS.chooseLanguage);
      const next = step(session, "ask_name", { language: chosen });
      return { session: next, reply: PROMPTS.askName[chosen] };
    }

    case "ask_name": {
      const next = step(session, "ask_state", { name: text });
      return { session: next, reply: PROMPTS.askState[lang] };
    }

    case "ask_state": {
      const st = STATE_BY_DIGIT[text];
      if (!st) return same(session, PROMPTS.askState[lang]);
      const next = step(session, "ask_crop", { state: st });
      return { session: next, reply: PROMPTS.askCrop[lang] };
    }

    case "ask_crop": {
      const farmer = finalizeFarmer(session, text);
      const next = step(session, "registered_menu", {});
      return { session: next, reply: PROMPTS.registered[lang], completedFarmer: farmer };
    }

    default:
      return same(session, PROMPTS.registered[lang]);
  }
}

function step(session: Session, to: Step, patch: Partial<Farmer>): Session {
  return { ...session, step: to, draft: { ...session.draft, ...patch } };
}

function same(session: Session, reply: string): Turn {
  return { session, reply };
}

/** Build the persisted Farmer once registration data is collected. */
function finalizeFarmer(session: Session, crop: string): Farmer {
  const d = session.draft;
  const state = (d.state ?? "MH") as StateCode;
  return {
    id: `farmer-${session.phone.replace(/\D/g, "")}`,
    phone: session.phone,
    name: d.name,
    language: (d.language ?? "en-IN") as LanguageCode,
    state,
    fields: [
      {
        id: `field-${session.phone.replace(/\D/g, "")}-1`,
        // Location is captured later (GPS/SMS) — default to a state centroid for v1.
        location: state === "MH" ? { lat: 18.99, lng: 75.76 } : { lat: 16.9, lng: 79.6 },
        district: state === "MH" ? "Beed" : "Nalgonda",
        state,
        currentCrop: crop,
      },
    ],
    createdAt: new Date().toISOString(),
  };
}
