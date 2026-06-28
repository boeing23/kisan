/**
 * Language-service interface. Implemented by GoogleLang now; keeps the door
 * open for a Bhashini implementation later without touching callers.
 */
import type { LanguageCode } from "@kisan/core";

export interface SpeechToTextInput {
  /** Raw audio bytes. */
  audio: Buffer;
  /** Encoding of the audio. WEBM_OPUS is what the browser MediaRecorder emits. */
  encoding: "LINEAR16" | "MP3" | "OGG_OPUS" | "MULAW" | "WEBM_OPUS";
  sampleRateHertz?: number;
  language: LanguageCode;
}

export interface TextToSpeechInput {
  text: string;
  language: LanguageCode;
  /** Output audio encoding. MP3 for WhatsApp, MULAW/LINEAR16 for telephony. */
  encoding?: "MP3" | "LINEAR16" | "MULAW";
}

export interface LangProvider {
  /** Transcribe farmer audio to text in the same language. */
  speechToText(input: SpeechToTextInput): Promise<string>;
  /** Synthesize speech audio from text. Returns audio bytes. */
  textToSpeech(input: TextToSpeechInput): Promise<Buffer>;
  /** Translate text between languages (e.g. farmer Marathi -> officer English). */
  translate(text: string, to: LanguageCode, from?: LanguageCode): Promise<string>;
}
