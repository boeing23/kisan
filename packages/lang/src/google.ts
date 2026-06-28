/**
 * Google Cloud implementation of LangProvider: Speech-to-Text, Text-to-Speech,
 * Translation. All three authenticate with the project service account.
 *
 * Voices are chosen per language; Google has Indic neural voices for mr-IN and
 * te-IN. Clients are created lazily so importing this module stays cheap.
 */
import { SpeechClient } from "@google-cloud/speech";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { v2 } from "@google-cloud/translate";
import { config } from "@kisan/core";
import type { LanguageCode } from "@kisan/core";
import type {
  LangProvider,
  SpeechToTextInput,
  TextToSpeechInput,
} from "./types.js";

/** Preferred neural voice per language. */
const VOICE: Record<LanguageCode, string> = {
  "mr-IN": "mr-IN-Wavenet-A",
  "te-IN": "te-IN-Standard-A",
  "hi-IN": "hi-IN-Wavenet-D",
  "en-IN": "en-IN-Wavenet-D",
};

/** BCP-47 codes for the Translation API (strip region where simplest). */
const TRANSLATE_CODE: Record<LanguageCode, string> = {
  "mr-IN": "mr",
  "te-IN": "te",
  "hi-IN": "hi",
  "en-IN": "en",
};

export class GoogleLang implements LangProvider {
  private speech?: SpeechClient;
  private tts?: TextToSpeechClient;
  private translator?: v2.Translate;

  constructor(private readonly keyFilename = config.serviceAccountPath) {}

  async speechToText(input: SpeechToTextInput): Promise<string> {
    this.speech ??= new SpeechClient({ keyFilename: this.keyFilename });
    const [response] = await this.speech.recognize({
      audio: { content: input.audio.toString("base64") },
      config: {
        encoding: input.encoding,
        sampleRateHertz: input.sampleRateHertz,
        languageCode: input.language,
        // Boost recognition of farming terms could go here via speechContexts.
      },
    });
    return (response.results ?? [])
      .map((r) => r.alternatives?.[0]?.transcript ?? "")
      .join(" ")
      .trim();
  }

  async textToSpeech(input: TextToSpeechInput): Promise<Buffer> {
    this.tts ??= new TextToSpeechClient({ keyFilename: this.keyFilename });
    const [response] = await this.tts.synthesizeSpeech({
      input: { text: input.text },
      voice: { languageCode: input.language, name: VOICE[input.language] },
      audioConfig: { audioEncoding: input.encoding ?? "MP3" },
    });
    const audio = response.audioContent;
    if (!audio) throw new Error("TTS returned no audio");
    return Buffer.isBuffer(audio) ? audio : Buffer.from(audio);
  }

  async translate(text: string, to: LanguageCode, from?: LanguageCode): Promise<string> {
    this.translator ??= new v2.Translate({ keyFilename: this.keyFilename });
    const [translated] = await this.translator.translate(text, {
      to: TRANSLATE_CODE[to],
      from: from ? TRANSLATE_CODE[from] : undefined,
    });
    return translated;
  }
}
