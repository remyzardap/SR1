/**
 * ElevenLabs calls for the voice function, over plain fetch.
 *
 * Both directions use the one key documented in ENVIRONMENT_VARIABLES.md
 * (ELEVEN_LABS_API_KEY); text to speech also needs ELEVEN_LABS_VOICE_ID.
 * The env var names are read from process.env at call time and the values are
 * never logged or returned.
 */

import { ENV } from "../_core/env";

const API_BASE = "https://api.elevenlabs.io/v1";
const TTS_MODEL_ID = "eleven_multilingual_v2";

export class VoiceNotConfiguredError extends Error {
  constructor() {
    super("Voice is not configured.");
    this.name = "VoiceNotConfiguredError";
  }
}

export class VoiceUpstreamError extends Error {
  constructor(public readonly providerStatus?: number) {
    super("The voice service could not be reached.");
    this.name = "VoiceUpstreamError";
  }
}

export function voiceConfigured(needVoice: boolean): boolean {
  if (!ENV.elevenLabsApiKey) return false;
  if (needVoice && !ENV.elevenLabsVoiceId) return false;
  return true;
}

/** Reads a recording back as text. Returns the transcript, empty when silent. */
export async function speechToText(audio: Buffer, mimeType: string): Promise<string> {
  if (!ENV.elevenLabsApiKey) throw new VoiceNotConfiguredError();

  const form = new FormData();
  const extension = EXTENSIONS[mimeType] ?? "webm";
  form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType || "audio/webm" }), `recording.${extension}`);

  const res = await fetch(`${API_BASE}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": ENV.elevenLabsApiKey },
    body: form,
  });

  if (!res.ok) {
    // Only the status is kept: provider bodies can echo request content.
    throw new VoiceUpstreamError(res.status);
  }

  const data = (await res.json()) as { text?: unknown };
  return typeof data.text === "string" ? data.text.trim() : "";
}

/** Reads text aloud. Returns the audio bytes with their content type. */
export async function textToSpeech(text: string): Promise<{ audio: Buffer; contentType: string }> {
  if (!voiceConfigured(true)) throw new VoiceNotConfiguredError();

  const res = await fetch(`${API_BASE}/text-to-speech/${encodeURIComponent(ENV.elevenLabsVoiceId)}`, {
    method: "POST",
    headers: {
      "xi-api-key": ENV.elevenLabsApiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: TTS_MODEL_ID,
      voice_settings: { stability: 0.45, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) throw new VoiceUpstreamError(res.status);

  const contentType = res.headers.get("content-type") ?? "audio/mpeg";
  return { audio: Buffer.from(await res.arrayBuffer()), contentType };
}

const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};
