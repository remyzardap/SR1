/**
 * Video generation engines for the video function (/api/fn/video).
 *
 * Supported engines:
 *   openai  OpenAI video (Sora)
 *   gemini  Gemini Veo video through Google AI Studio / Vertex AI
 *   qwen    Alibaba Wan video through DashScope
 *   forge   Open-weight video on GPU (Wan 2.1 / LTX-Video) via gpu-manager
 *
 * Videos take minutes, so all generations run as asynchronous background jobs
 * through pg-boss (see server/core/jobs.ts).
 */

import { randomUUID } from "crypto";
import { usageLogs } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { createFile, getDb } from "../db";
import { enqueueJob, registerJob } from "../core/jobs";
import { apiKeyFor } from "../core/kemmaRouter";
import { getVertexProject, getVertexToken, stripGooglePrefix, vertexEnabled } from "../core/vertexAuth";
import { getStorageAdapter } from "../storageAdapter";
import { fetchCapped } from "./fnFetch";
import type { ImageReference } from "./fnImage";

export const VIDEO_ENGINE_IDS = ["openai", "gemini", "qwen", "forge"] as const;
export type VideoEngineId = (typeof VIDEO_ENGINE_IDS)[number];

export const VIDEO_QUALITIES = ["standard", "high"] as const;
export type VideoQuality = (typeof VIDEO_QUALITIES)[number];

export const VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
export type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIOS)[number];

export const VIDEO_ENGINE_LABELS: Record<VideoEngineId, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  qwen: "Qwen",
  forge: "Open-weight GPU",
};

export const VIDEO_DURATION_LIMITS: Record<VideoEngineId, { min: number; max: number; default: number }> = {
  gemini: { min: 5, max: 8, default: 5 },
  qwen: { min: 5, max: 5, default: 5 },
  openai: { min: 5, max: 20, default: 5 },
  forge: { min: 2, max: 5, default: 3 },
};

export const VIDEO_PROVIDER_TIMEOUTS_MS: Record<VideoEngineId, number> = {
  gemini: 300_000,
  qwen: 300_000,
  openai: 300_000,
  forge: 360_000,
};

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
export const VIDEO_DOWNLOAD_TIMEOUT_MS = 60_000;
export const VIDEO_PURPOSE = "video_generate";
export const VIDEO_JOB_NAME = "video-generate";

const AI_STUDIO_VIDEO_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const QWEN_DASHSCOPE_DEFAULT = "https://dashscope-intl.aliyuncs.com";

export const ROUGH_VIDEO_COST_USD_PER_VIDEO: Record<string, number> = {
  "veo-3.1-fast-generate-preview": 0.20,
  "veo-3.1-generate-preview": 0.40,
  "veo-2.0-generate-001": 0.35,
  "wan2.1-t2v-turbo": 0.10,
  "wan2.1-t2v-plus": 0.20,
  "sora-1.0-turbo": 0.20,
  "sora-1.0": 0.40,
  "wan2.1-t2v-1.3b": 0.007,
  "ltx-video-2b": 0.007,
};

// ─── Errors ──────────────────────────────────────────────────────────────────

export class VideoNotConfiguredError extends Error {
  constructor(public readonly label: string) {
    super(`${label} is not available right now.`);
    this.name = "VideoNotConfiguredError";
  }
}

export class VideoUpstreamError extends Error {
  constructor(public readonly providerStatus?: number, message = "The video engine failed. Please try again.") {
    super(message);
    this.name = "VideoUpstreamError";
  }
}

export class VideoTimeoutError extends Error {
  constructor() {
    super("The video engine timed out. Please try again.");
    this.name = "VideoTimeoutError";
  }
}

export class VideoReferenceError extends Error {
  constructor(label: string) {
    super(`${label} cannot use reference photos yet.`);
    this.name = "VideoReferenceError";
  }
}

export class VideoSafetyError extends Error {
  constructor(message = "This prompt cannot be processed because it violates safety policies.") {
    super(message);
    this.name = "VideoSafetyError";
  }
}

export class VideoJobNotFoundError extends Error {
  constructor() {
    super("Video job not found.");
    this.name = "VideoJobNotFoundError";
  }
}

// ─── Safety Refusal Check ───────────────────────────────────────────────────

const PROHIBITED_PATTERNS = [
  /\b(?:csam|child\s*sexual|underage\s*sexual|minor\s*sexual|pedophil|paedophil)\b/i,
  /\b(?:sexual\s*abuse\s*of\s*minors?|child\s*porn|minor\s*porn)\b/i,
  /\b(?:non-consensual\s*sexual|rape\s*video|snuff\s*film)\b/i,
];

export function assertVideoPromptSafe(prompt: string): void {
  const trimmed = (prompt || "").trim();
  for (const pattern of PROHIBITED_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new VideoSafetyError("Refused: prompt contains prohibited or illegal content.");
    }
  }
}

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface VideoJobParams {
  prompt: string;
  engine: VideoEngineId;
  quality: VideoQuality;
  aspectRatio: VideoAspectRatio;
  durationSec: number;
  references?: ImageReference[];
}

export interface GeneratedVideo {
  engine: VideoEngineId;
  model: string;
  mimeType: string;
  buffer: Buffer;
  durationSec?: number;
}

export interface StoredVideo {
  key: string;
  url: string;
  sizeBytes: number;
  fileId?: number;
}

export interface VideoEngineInfo {
  id: VideoEngineId;
  label: string;
  model: string;
  qualityModel: string;
  available: boolean;
  defaultEngine: boolean;
  supportsReference: boolean;
  minDurationSec: number;
  maxDurationSec: number;
  /** Shapes the engine accepts. */
  aspectRatios: VideoAspectRatio[];
  /** Typical wall-clock time for one video, shown on the engine card. */
  estimateMinSeconds: number;
  estimateMaxSeconds: number;
}

export type VideoJobState = "QUEUED" | "DRAWING" | "SAVING" | "DONE" | "FAILED" | "CANCELLED";

export interface VideoJobRecord {
  id: string;
  userId: number;
  params: VideoJobParams;
  state: VideoJobState;
  progress: number;
  etaSeconds: number | null;
  videoUrl?: string;
  fileId?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
  cancelled?: boolean;
  abortController?: AbortController;
}

export const REFERENCE_VIDEO_ENGINES: readonly VideoEngineId[] = ["gemini", "qwen"];

export function supportsVideoReference(engine: VideoEngineId): boolean {
  return REFERENCE_VIDEO_ENGINES.includes(engine);
}

// ─── Catalogue, models, duration clamping ───────────────────────────────────

export function clampDuration(engine: VideoEngineId, requested?: number): number {
  const limits = VIDEO_DURATION_LIMITS[engine];
  if (typeof requested !== "number" || Number.isNaN(requested) || requested <= 0) {
    return limits.default;
  }
  const rounded = Math.round(requested);
  return Math.min(Math.max(rounded, limits.min), limits.max);
}

export function videoModel(engine: VideoEngineId, quality: VideoQuality): string {
  switch (engine) {
    case "gemini":
      return quality === "high"
        ? (process.env.KEMMA_MODEL_VIDEO_PRO || "veo-3.1-generate-preview").trim()
        : (process.env.KEMMA_MODEL_VIDEO || "veo-3.1-fast-generate-preview").trim();
    case "qwen":
      return quality === "high"
        ? (process.env.QWEN_VIDEO_MODEL_PRO || "wan2.1-t2v-plus").trim()
        : (process.env.QWEN_VIDEO_MODEL || "wan2.1-t2v-turbo").trim();
    case "openai":
      return quality === "high"
        ? (process.env.OPENAI_VIDEO_MODEL_PRO || "sora-1.0").trim()
        : (process.env.OPENAI_VIDEO_MODEL || "sora-1.0-turbo").trim();
    case "forge":
      return quality === "high"
        ? (process.env.FORGE_VIDEO_MODEL_PRO || "ltx-video-2b").trim()
        : (process.env.FORGE_VIDEO_MODEL || "wan2.1-t2v-1.3b").trim();
  }
}

export function forgeManager(): { url: string; token: string } | null {
  const url = (process.env.FORGE_MANAGER_URL || "").trim().replace(/\/+$/, "");
  const token = (process.env.FORGE_MANAGER_TOKEN || "").trim();
  return url && token ? { url, token } : null;
}

/**
 * True when the engine is genuinely available with configured keys.
 * Note: Qwen token plan keys cannot call video synthesis, and KoboiLLM has no video models.
 */
export function engineAvailable(engine: VideoEngineId): boolean {
  switch (engine) {
    case "gemini":
      return vertexEnabled() || !!ENV.geminiApiKey;
    case "qwen": {
      // QWEN_API_KEY is token-plan only which rejects async video-synthesis.
      // Qwen video requires an explicit QWEN_VIDEO_API_KEY or non-token-plan DashScope key.
      const dedicatedKey = (process.env.QWEN_VIDEO_API_KEY || "").trim();
      return !!dedicatedKey;
    }
    case "openai": {
      // KoboiLLM / LiteLLM gateway has no video models.
      // OpenAI video requires dedicated OPENAI_VIDEO_API_KEY.
      const dedicatedKey = (process.env.OPENAI_VIDEO_API_KEY || "").trim();
      return !!dedicatedKey;
    }
    case "forge":
      return !!forgeManager();
  }
}

/** Default engine: VIDEO_ENGINE_DEFAULT if valid and available; otherwise first available from [openai, gemini, qwen, forge]. */
export function defaultVideoEngine(): VideoEngineId {
  const fromEnv = (process.env.VIDEO_ENGINE_DEFAULT || "").trim().toLowerCase();
  if ((VIDEO_ENGINE_IDS as readonly string[]).includes(fromEnv)) {
    const candidate = fromEnv as VideoEngineId;
    if (engineAvailable(candidate)) return candidate;
  }
  for (const candidate of VIDEO_ENGINE_IDS) {
    if (engineAvailable(candidate)) return candidate;
  }
  return "gemini";
}

/**
 * Sensitive-content routing hook.
 * Currently returns requestedEngine (or defaultVideoEngine), ready to be wired to Venice later.
 */
export function resolveVideoEngine(prompt: string, requestedEngine?: VideoEngineId): VideoEngineId {
  return requestedEngine ?? defaultVideoEngine();
}

/** Rough time for one video per engine (Gemini measured at about 50 s for 5 s of video). */
export const VIDEO_TIME_ESTIMATE: Record<VideoEngineId, { min: number; max: number }> = {
  gemini: { min: 40, max: 90 },
  qwen: { min: 60, max: 120 },
  openai: { min: 60, max: 180 },
  forge: { min: 120, max: 300 },
};

export function listVideoEngines(): VideoEngineInfo[] {
  const def = defaultVideoEngine();
  return VIDEO_ENGINE_IDS.map((id) => ({
    id,
    label: VIDEO_ENGINE_LABELS[id],
    model: videoModel(id, "standard"),
    qualityModel: videoModel(id, "high"),
    available: engineAvailable(id),
    defaultEngine: id === def,
    supportsReference: supportsVideoReference(id),
    minDurationSec: VIDEO_DURATION_LIMITS[id].min,
    maxDurationSec: VIDEO_DURATION_LIMITS[id].max,
    aspectRatios: [...VIDEO_ASPECT_RATIOS],
    estimateMinSeconds: VIDEO_TIME_ESTIMATE[id].min,
    estimateMaxSeconds: VIDEO_TIME_ESTIMATE[id].max,
  }));
}

export function roughVideoCostUsd(model: string): number {
  const exact = ROUGH_VIDEO_COST_USD_PER_VIDEO[model];
  if (exact !== undefined) return exact;
  const prefix = Object.keys(ROUGH_VIDEO_COST_USD_PER_VIDEO).find((id) => model.startsWith(id));
  return prefix ? ROUGH_VIDEO_COST_USD_PER_VIDEO[prefix] : 0;
}

// ─── Video Providers ────────────────────────────────────────────────────────

export async function generateVideo(
  job: VideoJobParams,
  options?: { signal?: AbortSignal; onProgress?: (p: number, eta: number | null) => void }
): Promise<GeneratedVideo> {
  assertVideoPromptSafe(job.prompt);
  if (job.references?.length && !supportsVideoReference(job.engine)) {
    throw new VideoReferenceError(VIDEO_ENGINE_LABELS[job.engine]);
  }
  if (!engineAvailable(job.engine)) {
    throw new VideoNotConfiguredError(VIDEO_ENGINE_LABELS[job.engine]);
  }

  switch (job.engine) {
    case "gemini":
      return geminiVideo(job, options);
    case "qwen":
      return qwenVideo(job, options);
    case "openai":
      return openaiVideo(job, options);
    case "forge":
      return forgeVideo(job, options);
  }
}

// ─── Gemini (Veo) ───────────────────────────────────────────────────────────

export function vertexVideoEndpoint(project: string, model: string, location = "global"): string {
  const loc = location === "global" ? "global" : location;
  const host = loc === "global" ? "https://aiplatform.googleapis.com" : `https://${loc}-aiplatform.googleapis.com`;
  return `${host}/v1/projects/${project}/locations/${loc}/publishers/google/models/${stripGooglePrefix(model)}:predictLongRunning`;
}

export function aiStudioVideoEndpoint(model: string, key: string): string {
  return `${AI_STUDIO_VIDEO_BASE}/${stripGooglePrefix(model)}:predictLongRunning?key=${key}`;
}

async function geminiVideo(
  job: VideoJobParams,
  options?: { signal?: AbortSignal; onProgress?: (p: number, eta: number | null) => void }
): Promise<GeneratedVideo> {
  const model = videoModel("gemini", job.quality);
  const references = job.references ?? [];

  const instance: Record<string, unknown> = { prompt: job.prompt };
  if (references.length > 0) {
    instance.image = {
      bytesBase64Encoded: references[0].bytes.toString("base64"),
      mimeType: references[0].mimeType,
    };
  }

  const payload = {
    instances: [instance],
    parameters: {
      aspectRatio: job.aspectRatio,
      durationSeconds: job.durationSec,
    },
  };

  let submitUrl: string;
  let headers: Record<string, string> = { "Content-Type": "application/json" };
  let isVertex = false;
  let token = "";
  const apiKey = ENV.geminiApiKey;

  if (vertexEnabled()) {
    try {
      const project = await getVertexProject();
      token = await getVertexToken();
      submitUrl = vertexVideoEndpoint(project, model, process.env.VERTEX_LOCATION || "global");
      headers.Authorization = `Bearer ${token}`;
      isVertex = true;
    } catch {
      if (!apiKey) throw new VideoUpstreamError(undefined, "Vertex AI auth failed and AI Studio key is unset.");
      submitUrl = aiStudioVideoEndpoint(model, apiKey);
      isVertex = false;
    }
  } else {
    if (!apiKey) throw new VideoNotConfiguredError(VIDEO_ENGINE_LABELS.gemini);
    submitUrl = aiStudioVideoEndpoint(model, apiKey);
    isVertex = false;
  }

  const submitRes = await fetch(submitUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  if (!submitRes.ok) {
    throw new VideoUpstreamError(submitRes.status);
  }

  const submitData = (await submitRes.json()) as { name?: string };
  const operationName = submitData.name;
  if (!operationName) throw new VideoUpstreamError();

  // Poll operation
  const pollIntervalMs = 4000;
  const deadline = Date.now() + VIDEO_PROVIDER_TIMEOUTS_MS.gemini;
  let progress = 0.15;

  while (Date.now() < deadline) {
    if (options?.signal?.aborted) throw new Error("Operation aborted");

    await sleep(pollIntervalMs, options?.signal);
    progress = Math.min(0.9, progress + 0.05);
    const remainingSec = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    options?.onProgress?.(progress, remainingSec);

    let statusUrl: string;
    let pollHeaders: Record<string, string> = {};
    if (isVertex) {
      statusUrl = `https://aiplatform.googleapis.com/v1/${operationName}`;
      pollHeaders.Authorization = `Bearer ${token}`;
    } else {
      statusUrl = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`;
    }

    const opRes = await fetch(statusUrl, { headers: pollHeaders, signal: options?.signal });
    if (!opRes.ok) continue;

    const opData = (await opRes.json()) as {
      done?: boolean;
      error?: { code: number; message: string };
      response?: {
        generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }> };
        generatedSamples?: Array<{ video?: { uri?: string } }>;
      };
    };

    if (opData.error) {
      throw new VideoUpstreamError(opData.error.code, opData.error.message || "Video generation failed");
    }

    if (opData.done) {
      const uri =
        opData.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
        opData.response?.generatedSamples?.[0]?.video?.uri;
      if (!uri) throw new VideoUpstreamError();

      const downloadUrl = isVertex ? uri : `${uri}${uri.includes("?") ? "&" : "?"}key=${apiKey}`;
      const downloaded = await downloadVideo(downloadUrl);
      return {
        engine: "gemini",
        model,
        mimeType: downloaded.mimeType,
        buffer: downloaded.buffer,
        durationSec: job.durationSec,
      };
    }
  }

  throw new VideoTimeoutError();
}

// ─── Qwen (Wan) ─────────────────────────────────────────────────────────────

async function qwenVideo(
  job: VideoJobParams,
  options?: { signal?: AbortSignal; onProgress?: (p: number, eta: number | null) => void }
): Promise<GeneratedVideo> {
  const key = process.env.QWEN_VIDEO_API_KEY || apiKeyFor("qwen");
  if (!key) throw new VideoNotConfiguredError(VIDEO_ENGINE_LABELS.qwen);

  const model = videoModel("qwen", job.quality);
  const base = (process.env.QWEN_VIDEO_BASE_URL || QWEN_DASHSCOPE_DEFAULT).replace(/\/+$/, "");
  const submitUrl = `${base}/api/v1/services/aigc/video-generation/video-synthesis`;

  const qwenSizes: Record<VideoAspectRatio, string> = {
    "16:9": "1280*720",
    "9:16": "720*1280",
    "1:1": "960*960",
  };

  const body = {
    model,
    input: { prompt: job.prompt },
    parameters: { size: qwenSizes[job.aspectRatio], duration: job.durationSec },
  };

  const res = await fetch(submitUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify(body),
    signal: options?.signal,
  });

  if (!res.ok) throw new VideoUpstreamError(res.status);
  const data = (await res.json()) as { output?: { task_id?: string } };
  const taskId = data.output?.task_id;
  if (!taskId) throw new VideoUpstreamError();

  const pollIntervalMs = 4000;
  const deadline = Date.now() + VIDEO_PROVIDER_TIMEOUTS_MS.qwen;
  let progress = 0.15;

  while (Date.now() < deadline) {
    if (options?.signal?.aborted) throw new Error("Operation aborted");
    await sleep(pollIntervalMs, options?.signal);
    progress = Math.min(0.9, progress + 0.05);
    options?.onProgress?.(progress, Math.max(0, Math.round((deadline - Date.now()) / 1000)));

    const taskUrl = `${base}/api/v1/tasks/${taskId}`;
    const taskRes = await fetch(taskUrl, { headers: { Authorization: `Bearer ${key}` }, signal: options?.signal });
    if (!taskRes.ok) continue;

    const taskData = (await taskRes.json()) as {
      output?: { task_status?: string; video_url?: string; message?: string };
    };
    const status = taskData.output?.task_status;
    if (status === "SUCCEEDED" && taskData.output?.video_url) {
      const downloaded = await downloadVideo(taskData.output.video_url);
      return {
        engine: "qwen",
        model,
        mimeType: downloaded.mimeType,
        buffer: downloaded.buffer,
        durationSec: job.durationSec,
      };
    }
    if (status === "FAILED") {
      throw new VideoUpstreamError(undefined, taskData.output?.message || "Qwen video generation failed");
    }
  }

  throw new VideoTimeoutError();
}

// ─── OpenAI (Sora) ──────────────────────────────────────────────────────────

async function openaiVideo(
  job: VideoJobParams,
  options?: { signal?: AbortSignal; onProgress?: (p: number, eta: number | null) => void }
): Promise<GeneratedVideo> {
  const key = process.env.OPENAI_VIDEO_API_KEY || apiKeyFor("litellm");
  if (!key) throw new VideoNotConfiguredError(VIDEO_ENGINE_LABELS.openai);

  const model = videoModel("openai", job.quality);
  const base = (process.env.OPENAI_VIDEO_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const submitUrl = `${base}/videos/generations`;

  const sizes: Record<VideoAspectRatio, string> = {
    "16:9": "1280x720",
    "9:16": "720x1280",
    "1:1": "720x720",
  };

  const res = await fetch(submitUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: job.prompt, size: sizes[job.aspectRatio], duration: job.durationSec }),
    signal: options?.signal,
  });

  if (!res.ok) throw new VideoUpstreamError(res.status);
  const data = (await res.json()) as { data?: Array<{ url?: string; b64_json?: string }> };
  const first = data.data?.[0];
  if (first?.url) {
    const downloaded = await downloadVideo(first.url);
    return { engine: "openai", model, mimeType: downloaded.mimeType, buffer: downloaded.buffer, durationSec: job.durationSec };
  }
  if (first?.b64_json) {
    return { engine: "openai", model, mimeType: "video/mp4", buffer: Buffer.from(first.b64_json, "base64"), durationSec: job.durationSec };
  }

  throw new VideoUpstreamError();
}

// ─── Forge (GPU Open-Weight) ────────────────────────────────────────────────

async function forgeVideo(
  job: VideoJobParams,
  options?: { signal?: AbortSignal; onProgress?: (p: number, eta: number | null) => void }
): Promise<GeneratedVideo> {
  const manager = forgeManager();
  if (!manager) throw new VideoNotConfiguredError(VIDEO_ENGINE_LABELS.forge);

  const model = videoModel("forge", job.quality);
  const endpoint = `${manager.url}/v1/video`;

  options?.onProgress?.(0.2, 120);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "X-Manager-Token": manager.token, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: job.prompt,
      model,
      aspect_ratio: job.aspectRatio,
      duration_sec: job.durationSec,
    }),
    signal: options?.signal,
  });

  if (!res.ok) throw new VideoUpstreamError(res.status);
  const data = (await res.json()) as { video?: string; url?: string };
  if (data.video) {
    return { engine: "forge", model, mimeType: "video/mp4", buffer: Buffer.from(data.video, "base64"), durationSec: job.durationSec };
  }
  if (data.url) {
    const downloaded = await downloadVideo(data.url);
    return { engine: "forge", model, mimeType: downloaded.mimeType, buffer: downloaded.buffer, durationSec: job.durationSec };
  }

  throw new VideoUpstreamError();
}

// ─── Helpers: Download, Sniff, Storage ───────────────────────────────────────

export async function downloadVideo(
  rawUrl: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new VideoUpstreamError();
  }
  if (parsed.protocol !== "https:") throw new VideoUpstreamError();

  const work = fetchCapped(parsed.toString(), MAX_VIDEO_BYTES);
  try {
    const fetched = await Promise.race([
      work,
      new Promise<never>((_, reject) => setTimeout(() => reject(new VideoTimeoutError()), VIDEO_DOWNLOAD_TIMEOUT_MS)),
    ]);
    const mimeType = isMp4(fetched.buffer) ? "video/mp4" : fetched.contentType || "video/mp4";
    return { buffer: fetched.buffer, mimeType };
  } catch (err) {
    if (err instanceof VideoTimeoutError) throw err;
    throw new VideoUpstreamError();
  }
}

export function isMp4(buffer: Buffer): boolean {
  return buffer.length > 8 && buffer.toString("ascii", 4, 8) === "ftyp";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Aborted"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("Aborted"));
    }, { once: true });
  });
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  return "mp4";
}

export async function storeVideo(userId: number, prompt: string, video: GeneratedVideo): Promise<StoredVideo> {
  const extension = extensionFor(video.mimeType);
  const name = `video-${randomUUID().slice(0, 8)}.${extension}`;
  const fileKey = `users/${userId}/videos/${name}`;

  const stored = await getStorageAdapter().put(fileKey, video.buffer, video.mimeType, { userId, name });
  const record = await createFile({
    userId,
    name,
    originalPrompt: prompt,
    format: "md",
    kind: "video",
    storageProvider: stored.provider,
    storageRef: stored.key,
    fileKey: stored.key,
    fileUrl: stored.url,
    fileSizeBytes: stored.sizeBytes,
    mimeType: video.mimeType,
  });

  return { key: stored.key, url: stored.url, sizeBytes: stored.sizeBytes, fileId: (record as any)?.id };
}

export async function logVideoUsage(userId: number, video: GeneratedVideo): Promise<void> {
  const database = await getDb();
  if (!database) return;

  try {
    await database.insert(usageLogs).values({
      userId,
      sessionId: null,
      reportId: null,
      provider: video.engine,
      model: video.model,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: String(roughVideoCostUsd(video.model)),
      purpose: VIDEO_PURPOSE,
    });
  } catch (err) {
    console.warn("[video] failed to log usage:", String(err));
  }
}

// ─── Job State Management & pg-boss ─────────────────────────────────────────

const jobsStore = new Map<string, VideoJobRecord>();

export function getVideoJob(jobId: string): VideoJobRecord | undefined {
  return jobsStore.get(jobId);
}

export function createVideoJob(userId: number, params: VideoJobParams): VideoJobRecord {
  const id = randomUUID();
  const record: VideoJobRecord = {
    id,
    userId,
    params,
    state: "QUEUED",
    progress: 0,
    etaSeconds: initialEtaSeconds(params.engine),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobsStore.set(id, record);
  return record;
}

function initialEtaSeconds(engine: VideoEngineId): number {
  switch (engine) {
    case "gemini": return 60;
    case "qwen": return 90;
    case "openai": return 60;
    case "forge": return 120;
  }
}

export async function cancelVideoJob(userId: number, jobId: string): Promise<boolean> {
  const job = jobsStore.get(jobId);
  if (!job || job.userId !== userId) return false;
  if (job.state === "DONE" || job.state === "FAILED" || job.state === "CANCELLED") return false;

  job.cancelled = true;
  job.state = "CANCELLED";
  job.updatedAt = Date.now();
  if (job.abortController) {
    job.abortController.abort();
  }
  return true;
}

export async function executeVideoJob(jobId: string): Promise<void> {
  const job = jobsStore.get(jobId);
  if (!job || job.cancelled || job.state === "CANCELLED") return;

  job.state = "DRAWING";
  job.progress = 0.1;
  job.updatedAt = Date.now();
  job.abortController = new AbortController();

  try {
    const video = await generateVideo(job.params, {
      signal: job.abortController.signal,
      onProgress: (p, eta) => {
        if (!job.cancelled) {
          job.progress = p;
          job.etaSeconds = eta;
          job.updatedAt = Date.now();
        }
      },
    });

    if (job.cancelled) return;

    job.state = "SAVING";
    job.progress = 0.95;
    job.updatedAt = Date.now();

    const stored = await storeVideo(job.userId, job.params.prompt, video);
    void logVideoUsage(job.userId, video);

    job.state = "DONE";
    job.progress = 1.0;
    job.etaSeconds = 0;
    job.videoUrl = stored.url;
    job.fileId = stored.fileId;
    job.updatedAt = Date.now();
  } catch (err: any) {
    if (job.cancelled) return;

    job.state = "FAILED";
    job.progress = 1.0;
    job.etaSeconds = 0;
    job.error = err instanceof VideoSafetyError
      ? err.message
      : err instanceof VideoNotConfiguredError
      ? err.message
      : err instanceof VideoReferenceError
      ? err.message
      : err instanceof VideoTimeoutError
      ? err.message
      : "The video engine failed. Please try again.";
    job.updatedAt = Date.now();
  }
}

/** Enqueues the job with pg-boss, or immediately runs async in-process if pg-boss runner is off. */
export async function queueVideoJob(userId: number, params: VideoJobParams): Promise<VideoJobRecord> {
  const job = createVideoJob(userId, params);

  let queued = false;
  try {
    const bossId = await enqueueJob(VIDEO_JOB_NAME, { jobId: job.id, userId });
    queued = !!bossId;
  } catch {
    queued = false;
  }

  if (!queued) {
    // In environments without pg-boss active (tests, standalone VPS dev), work the job in-process
    setTimeout(() => {
      void executeVideoJob(job.id);
    }, 0);
  }

  return job;
}

export function registerVideoJobs(): void {
  registerJob(VIDEO_JOB_NAME, async (data) => {
    const jobId = typeof data.jobId === "string" ? data.jobId : "";
    if (jobId) {
      await executeVideoJob(jobId);
    }
  });
}

// Automatically register background job on module evaluation
registerVideoJobs();
