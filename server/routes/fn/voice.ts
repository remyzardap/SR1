/**
 * voice function (POST /api/fn/voice).
 *
 * Two modes, from client/src/components/VoiceButton.tsx and SpeakButton.tsx:
 *   multipart/form-data, single field `file`  -> speech to text, SSE data lines
 *   POST ?mode=speak with { text: string }    -> text to speech, audio bytes
 *
 * Speech to text frames are data only (the client reads data lines, never event
 * names): `{ "delta": "<text>" }` fragments, then
 * `{ "type": "transcript.done", "text": "<full text>" }`, then `[DONE]`.
 * The provider is ElevenLabs in both directions.
 */

import multer from "multer";
import type { Request, Response } from "express";
import { FnError } from "../../lib/fnErrors";
import { VoiceNotConfiguredError, VoiceUpstreamError, speechToText, textToSpeech, voiceConfigured } from "../../lib/fnVoice";
import { asRecord, requireText, sendError, startSse, writeSseData } from "./shared";

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
/** SpeakButton.tsx trims at 4000 characters; that is the ceiling we accept. */
export const MAX_SPEAK_CHARS = 4000;
export const TRANSCRIPT_DELTA_CHARS = 400;
export const VOICE_FIELD = "file";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 8 },
});

/** Multer-backed audio parse; runs only when the request is multipart. */
export function parseAudio(req: Request, res: Response, next: (err?: unknown) => void): void {
  if (!req.is("multipart/form-data")) return next();
  upload.single(VOICE_FIELD)(req as never, res as never, (err?: unknown) => {
    if (!err) return next();
    const tooLarge = (err as { code?: string }).code === "LIMIT_FILE_SIZE";
    sendError(res, tooLarge ? 413 : 400, tooLarge ? "Audio is limited to 10 MB." : "The recording could not be read.");
  });
}

export async function handleVoice(userId: number, req: Request, res: Response): Promise<void> {
  const speaking = req.query.mode === "speak";
  try {
    if (speaking) {
      await speak(req, res);
      return;
    }
    await transcribe(req, res);
  } catch (err) {
    if (err instanceof FnError) throw err;
    throw toFnError(err, speaking ? "speak" : "transcribe");
  }
}

async function transcribe(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (!file) throw new FnError(400, "No audio was received.");
  if (!file.mimetype.startsWith("audio/") && !file.mimetype.startsWith("video/")) {
    throw new FnError(400, "That is not an audio recording.");
  }
  if (file.size === 0) throw new FnError(400, "The recording is empty.");
  if (file.size > MAX_AUDIO_BYTES) throw new FnError(413, "Audio is limited to 10 MB.");
  if (!voiceConfigured(false)) throw new VoiceNotConfiguredError();

  const transcript = await speechToText(file.buffer, file.mimetype);

  startSse(res);
  if (!res.writableEnded) {
    for (const frame of transcriptFrames(transcript)) writeSseData(res, frame);
    writeSseData(res, "[DONE]");
    res.end();
  }
}

async function speak(req: Request, res: Response): Promise<void> {
  const text = requireText(asRecord(req.body), "text", MAX_SPEAK_CHARS);
  if (!voiceConfigured(true)) throw new VoiceNotConfiguredError();

  const audio = await textToSpeech(text);
  res.setHeader("Content-Type", audio.contentType);
  res.setHeader("Content-Length", String(audio.audio.byteLength));
  res.send(audio.audio);
}

/**
 * The frames the client accumulates: delta fragments first, then one
 * transcript.done carrying the whole text, which the client uses to replace
 * whatever it collected.
 */
export function transcriptFrames(transcript: string): Array<Record<string, string>> {
  const text = transcript.trim();
  if (!text) return [{ type: "transcript.done", text: "" }];

  const frames: Array<Record<string, string>> = [];
  for (let i = 0; i < text.length; i += TRANSCRIPT_DELTA_CHARS) {
    frames.push({ delta: text.slice(i, i + TRANSCRIPT_DELTA_CHARS) });
  }
  frames.push({ type: "transcript.done", text });
  return frames;
}

/**
 * Voice-provider failures only. The upstream status goes to the log, never to
 * the client; anything else is left for the router to answer as a 500.
 */
function toFnError(err: unknown, kind: "transcribe" | "speak"): unknown {
  if (err instanceof VoiceNotConfiguredError) return new FnError(503, "Voice is not configured.");
  if (err instanceof VoiceUpstreamError) {
    console.error(`[fn:voice] ${kind} failed upstream${err.providerStatus ? ` (status ${err.providerStatus})` : ""}`);
    return new FnError(502, "Voice is unavailable right now. Please try again.");
  }
  return err;
}
