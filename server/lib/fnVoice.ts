/**
 * ElevenLabs calls for the voice function, over plain fetch.
 *
 * Both directions use the one key documented in ENVIRONMENT_VARIABLES.md
 * (ELEVEN_LABS_API_KEY); text to speech also needs ELEVEN_LABS_VOICE_ID.
 * The voice colour (stability, similarity, style, speaker boost, speed) and the
 * model ids are tunable per env var with defaults set for Kemma's warm spoken
 * persona; every name is documented in ENVIRONMENT_VARIABLES.md.
 * The env var names are read from process.env at call time and the values are
 * never logged or returned.
 */

import { ENV } from "../_core/env";

const API_BASE = "https://api.elevenlabs.io/v1";

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

/** A 0..1 tuning knob from env; unset or unparsable keeps the default. */
function voiceNumber(name: string, fallback: number, min = 0, max = 1): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function voiceFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return !["0", "false", "off", "no"].includes(raw.trim().toLowerCase());
}

function voiceModel(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

/**
 * The voice-settings object ElevenLabs accepts, tuned for the warm, intimate
 * spoken persona (a touch lower stability and a little style for expression).
 * Shared by the text-to-speech function and the conversational agent session.
 */
export function elevenLabsVoiceSettings(): {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
} {
  return {
    stability: voiceNumber("ELEVEN_LABS_VOICE_STABILITY", 0.35),
    similarity_boost: voiceNumber("ELEVEN_LABS_VOICE_SIMILARITY_BOOST", 0.75),
    style: voiceNumber("ELEVEN_LABS_VOICE_STYLE", 0.4),
    use_speaker_boost: voiceFlag("ELEVEN_LABS_VOICE_SPEAKER_BOOST", true),
  };
}

/** Model id for the voice-call agent (Conversational AI). */
export function elevenLabsAgentModelId(): string {
  return voiceModel("ELEVEN_LABS_AGENT_TTS_MODEL_ID", "eleven_turbo_v2_5");
}

/** Agent speaking speed, kept slightly under natural for a calm, close tone. */
export function elevenLabsAgentSpeed(): number {
  return voiceNumber("ELEVEN_LABS_VOICE_SPEED", 0.95, 0.5, 2);
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

/**
 * Rewrites a written answer so it can be read aloud as speech: no markdown,
 * no list scaffolding, no citation markers or source lists, no bare urls.
 * Sentence rhythm carries the pauses, so lines are rejoined with a breath
 * (", ") unless they already end on sentence punctuation.
 */
export function toSpokenText(text: string): string {
  let out = text;
  // Drop trailing "Sources:"/"References:" blocks, markdown "## Sources / 12" sections included.
  out = out.replace(/\n+#?\s*(?:Sources|References|Citations)\b[^\n]*\n[\s\S]*$/i, "\n");
  out = out.replace(/```[\s\S]*?```/g, " ");
  out = out.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"); // markdown links keep their words
  out = out.replace(/\[\d+\]/g, ""); // inline citation markers
  out = out.replace(/https?:\/\/\S+/g, "");
  out = out.replace(/^#{1,6}\s+/gm, "");
  out = out.replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "");
  out = out.replace(/[*_~`]/g, "");
  out = out.replace(/\[|\]/g, "");
  out = out.replace(/\|/g, ",");
  out = out.replace(/\s+([,.!?;:])/g, "$1");
  const lines = out.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  let spoken = "";
  for (const line of lines) {
    if (!spoken) spoken = line;
    else if (/[.!?…:]$/.test(spoken)) spoken += " " + line;
    else if (/^[A-Z]/.test(line)) spoken += ". " + line;
    else spoken += ", " + line;
  }
  return spoken.replace(/\s*,\s*(?:,|$)/g, "").replace(/\s{2,}/g, " ").replace(/^[,\s]+/, "").trim();
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
      text: toSpokenText(text),
      model_id: voiceModel("ELEVEN_LABS_TTS_MODEL_ID", "eleven_multilingual_v2"),
      voice_settings: elevenLabsVoiceSettings(),
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
