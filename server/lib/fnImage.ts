/**
 * Image generation engines for the image function (POST /api/fn/image).
 *
 * The caller picks the engine and exactly that engine runs. There is no
 * fallback chain: every image costs money and the choice is the user's.
 *
 *   gemini  Gemini image models through Vertex AI in location `global` (the
 *           deployed setup, GEMINI_BACKEND=vertex) or through the AI Studio API
 *   qwen    Alibaba Wan image models on the Qwen plan host, native route (the
 *           OpenAI images route on that host answers 404)
 *   openai  gpt-image-2 through the LiteLLM gateway
 *   forge   Stable Diffusion Forge on a Jarvislabs GPU (Realistic Vision for
 *           standard, Flux for high), reached through the gpu-manager service,
 *           which wakes the paused GPU for the request and pauses it when idle
 *
 * Reference photos go to the first three: an image part before the text part
 * for Gemini, image content items before the text item for Wan, and the
 * multipart `images/edits` route for the gateway. Forge stays text to image
 * only, so a request that carries references is refused with 400.
 *
 * Keys are read from the environment at call time. Provider response bodies are
 * never read into an error or a log, keys and tokens never reach a response, and
 * a provider-hosted image URL is downloaded here instead of being handed to the
 * client.
 */

import { randomUUID } from "crypto";
import { usageLogs } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { createFile, getDb } from "../db";
import { apiKeyFor, litellmBaseUrl } from "../core/kemmaRouter";
import { getVertexProject, getVertexToken, stripGooglePrefix, vertexEnabled } from "../core/vertexAuth";
import { getStorageAdapter } from "../storageAdapter";
import { fetchCapped } from "./fnFetch";

export const ENGINE_IDS = ["gemini", "qwen", "openai", "forge"] as const;
export type EngineId = (typeof ENGINE_IDS)[number];

export const QUALITIES = ["standard", "high"] as const;
export type ImageQuality = (typeof QUALITIES)[number];

export const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const ENGINE_LABELS: Record<EngineId, string> = {
  gemini: "Gemini",
  qwen: "Qwen",
  openai: "OpenAI",
  forge: "Stable Diffusion",
};

/**
 * Deadline per provider, from the timings seen live: Gemini pro image calls have
 * run to 66 s, the others answered inside 35 s.
 */
export const PROVIDER_TIMEOUTS_MS: Record<EngineId, number> = {
  gemini: 90_000,
  qwen: 60_000,
  openai: 60_000,
  // A cold GPU wakes in about 30 to 60 s before the image itself starts.
  forge: 300_000,
};
/** Reading back a provider-hosted image has its own shorter deadline. */
export const DOWNLOAD_TIMEOUT_MS = 30_000;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const IMAGE_PURPOSE = "image_generate";

const AI_STUDIO_IMAGE_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const QWEN_DEFAULT_ORIGIN = "https://token-plan.maas.qwencloudapi.com";
/** The native Wan route sits on the plan host itself, not under the compatible-mode path. */
const QWEN_IMAGE_PATH = "/api/v1/services/aigc/multimodal-generation/generation";

interface ModelSlot {
  env: string;
  fallback: string;
}

/** Model per quality, every one of them overridable by env and read at call time. */
const MODEL_SLOTS: Record<EngineId, { standard: ModelSlot; high: ModelSlot }> = {
  gemini: {
    standard: { env: "KEMMA_MODEL_IMAGE", fallback: "gemini-3.1-flash-image" },
    high: { env: "KEMMA_MODEL_IMAGE_PRO", fallback: "gemini-3-pro-image" },
  },
  qwen: {
    standard: { env: "QWEN_IMAGE_MODEL", fallback: "wan2.7-image" },
    high: { env: "QWEN_IMAGE_MODEL_PRO", fallback: "wan2.7-image-pro" },
  },
  openai: {
    standard: { env: "OPENAI_IMAGE_MODEL", fallback: "gpt-image-2" },
    high: { env: "OPENAI_IMAGE_MODEL", fallback: "gpt-image-2" },
  },
  forge: {
    standard: { env: "FORGE_MODEL", fallback: "realisticVision_v60B1.safetensors" },
    high: { env: "FORGE_MODEL_PRO", fallback: "flux1-dev-bnb-nf4-v2.safetensors" },
  },
};

/**
 * Wan takes a `width*height` size. `1024*1024` and `768*1024` are verified live;
 * the rest of the map is the intended shape, in one constant so it can be
 * corrected after the remaining ratios have been tested.
 */
export const QWEN_SIZES: Record<AspectRatio, string> = {
  "1:1": "1024*1024",
  "16:9": "1280*720",
  "9:16": "720*1280",
  "4:3": "1024*768",
  "3:4": "768*1024",
};

/**
 * gpt-image-2 serves three sizes only, so the four non-square ratios go to the
 * matching orientation. Verified live: 1024x1024, 1024x1536 (portrait) and
 * 1536x1024 (landscape).
 */
export const OPENAI_SIZES: Record<AspectRatio, string> = {
  "1:1": "1024x1024",
  "16:9": "1536x1024",
  "9:16": "1024x1536",
  "4:3": "1536x1024",
  "3:4": "1024x1536",
};

/** SD 1.5 class models draw best near 512 px; Flux takes about a megapixel. All sides are multiples of 8. */
export const FORGE_SD_SIZES: Record<AspectRatio, [number, number]> = {
  "1:1": [512, 512],
  "16:9": [768, 432],
  "9:16": [432, 768],
  "4:3": [640, 480],
  "3:4": [480, 640],
};
export const FORGE_FLUX_SIZES: Record<AspectRatio, [number, number]> = {
  "1:1": [1024, 1024],
  "16:9": [1280, 720],
  "9:16": [720, 1280],
  "4:3": [1152, 864],
  "3:4": [864, 1152],
};

/**
 * Rough per-image cost in USD, keyed by the model id that ran. Estimates only:
 * they are for the usage log, not billing, and an unknown model logs 0.
 */
export const ROUGH_IMAGE_COST_USD_PER_IMAGE: Record<string, number> = {
  "gemini-3.1-flash-image": 0.04,
  "gemini-3-pro-image": 0.13,
  "wan2.7-image": 0.05,
  "gpt-image-2": 0.06,
  // GPU time at $0.44/hr: a few tenths of a cent per image.
  "realisticVision": 0.001,
  "flux1-dev": 0.004,
};

export class ImageNotConfiguredError extends Error {
  constructor(public readonly label: string) {
    super(`${label} is not available right now.`);
    this.name = "ImageNotConfiguredError";
  }
}

/** The engine could not produce an image. The provider status stays in the log. */
export class ImageUpstreamError extends Error {
  constructor(public readonly providerStatus?: number) {
    super("The image engine failed. Please try again.");
    this.name = "ImageUpstreamError";
  }
}

export class ImageTimeoutError extends Error {
  constructor() {
    super("The image engine timed out. Please try again.");
    this.name = "ImageTimeoutError";
  }
}

/** The engine cannot work from reference photos. */
export class ImageReferenceError extends Error {
  constructor(label: string) {
    super(label === ENGINE_LABELS.forge ? `${label} on the GPU cannot use reference photos yet.` : `${label} cannot use reference photos yet.`);
    this.name = "ImageReferenceError";
  }
}

/** One attached picture an engine draws from. */
export interface ImageReference {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

export interface ImageJob {
  prompt: string;
  engine: EngineId;
  quality: ImageQuality;
  aspectRatio: AspectRatio;
  /** Reference photos, already resolved to bytes. At most two, images only. */
  references?: ImageReference[];
}

export interface GeneratedImage {
  engine: EngineId;
  model: string;
  mimeType: string;
  width?: number;
  height?: number;
  buffer: Buffer;
}

export interface EngineInfo {
  id: EngineId;
  label: string;
  model: string;
  qualityModel: string;
  available: boolean;
  defaultEngine: boolean;
  supportsReference: boolean;
}

/**
 * Engines that can draw from reference photos. Forge (Stable Diffusion) cannot. OpenAI cannot through the
 * KoboiLLM gateway for now: its /images/edits route answers 400 "Unknown parameter: additional_drop_params"
 * for every request shape (tested live 2026-10-02), so the form code stays but the engine is not offered
 * for references. Add "openai" back once the gateway handles edits.
 */
export const REFERENCE_ENGINES: readonly EngineId[] = ["gemini", "qwen"];

export function supportsReference(engine: EngineId): boolean {
  return REFERENCE_ENGINES.includes(engine);
}

/** The 400 text an engine that cannot take references answers with. */
export function referenceRejection(engine: EngineId): string {
  return new ImageReferenceError(ENGINE_LABELS[engine]).message;
}

// ─── Catalogue: models, availability, listing ────────────────────────────────

export function imageModel(engine: EngineId, quality: ImageQuality): string {
  const slot = MODEL_SLOTS[engine][quality];
  return (process.env[slot.env] || "").trim() || slot.fallback;
}

/** True when the engine has what it needs to answer: a key, or Vertex credentials. */
export function engineAvailable(engine: EngineId): boolean {
  switch (engine) {
    case "gemini":
      return vertexEnabled() || !!ENV.geminiApiKey;
    case "qwen":
      return !!apiKeyFor("qwen");
    case "openai":
      return !!apiKeyFor("litellm");
    case "forge":
      return !!forgeManager();
  }
}

/** IMAGE_ENGINE_DEFAULT wins; anything unknown falls back to gemini. */
export function defaultEngine(): EngineId {
  const fromEnv = (process.env.IMAGE_ENGINE_DEFAULT || "").trim().toLowerCase();
  return (ENGINE_IDS as readonly string[]).includes(fromEnv) ? (fromEnv as EngineId) : "gemini";
}

/** What the picker shows. Carries no key, no URL and no path. */
export function listEngines(): EngineInfo[] {
  const fallback = defaultEngine();
  return ENGINE_IDS.map((id) => ({
    id,
    label: ENGINE_LABELS[id],
    model: imageModel(id, "standard"),
    qualityModel: imageModel(id, "high"),
    available: engineAvailable(id),
    defaultEngine: id === fallback,
    supportsReference: supportsReference(id),
  }));
}

export function roughImageCostUsd(model: string): number {
  const exact = ROUGH_IMAGE_COST_USD_PER_IMAGE[model];
  if (exact !== undefined) return exact;
  const prefix = Object.keys(ROUGH_IMAGE_COST_USD_PER_IMAGE).find((id) => model.startsWith(id));
  return prefix ? ROUGH_IMAGE_COST_USD_PER_IMAGE[prefix] : 0;
}

/** Runs exactly the engine in the job. Never another one. */
export async function generateImage(job: ImageJob): Promise<GeneratedImage> {
  if (job.references?.length && !supportsReference(job.engine)) throw new ImageReferenceError(ENGINE_LABELS[job.engine]);
  switch (job.engine) {
    case "gemini":
      return geminiImage(job);
    case "qwen":
      return qwenImage(job);
    case "openai":
      return openaiImage(job);
    case "forge":
      return forgeImage(job);
  }
}

// ─── Gemini: Vertex AI global, or AI Studio ──────────────────────────────────

/**
 * Image models are served from `global` only, so this builds its own URL rather
 * than reusing vertexGenerateContentUrl(), which follows VERTEX_LOCATION.
 */
export function vertexImageEndpoint(project: string, model: string): string {
  const publisher = stripGooglePrefix(model);
  return `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${publisher}:generateContent`;
}

export function aiStudioImageEndpoint(model: string): string {
  return `${AI_STUDIO_IMAGE_BASE}/${stripGooglePrefix(model)}:generateContent`;
}

/**
 * Native generateContent body asking for an image back. Same shape on both
 * backends. All five ratios are accepted: 1:1 came back 1024x1024, 9:16
 * 768x1376 and 3:4 896x1200, so the frame is the model's to choose.
 *
 * Reference photos go in as inlineData parts ahead of the text part, which is
 * the order the image models document for edit-style prompts.
 */
export function geminiImageBody(prompt: string, aspectRatio: AspectRatio, references: ImageReference[] = []): Record<string, unknown> {
  return {
    contents: [{ role: "user", parts: [...referenceParts(references), { text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio } },
  };
}

/** One image part per reference, in the order the caller sent them. */
export function referenceParts(references: ImageReference[]): Record<string, unknown>[] {
  return references.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.bytes.toString("base64") } }));
}

async function geminiImage(job: ImageJob): Promise<GeneratedImage> {
  const model = imageModel("gemini", job.quality);
  const body = geminiImageBody(job.prompt, job.aspectRatio, job.references ?? []);

  let url: string;
  let headers: Record<string, string>;
  if (vertexEnabled()) {
    try {
      const project = await getVertexProject();
      const token = await getVertexToken();
      url = vertexImageEndpoint(project, model);
      headers = { Authorization: `Bearer ${token}` };
    } catch {
      // vertexAuth reports its own generic fault; to the client this is an engine failure.
      throw new ImageUpstreamError();
    }
  } else {
    const key = ENV.geminiApiKey;
    if (!key) throw new ImageNotConfiguredError(ENGINE_LABELS.gemini);
    url = aiStudioImageEndpoint(model);
    headers = { "x-goog-api-key": key };
  }

  const data = await postJson(url, headers, body, PROVIDER_TIMEOUTS_MS.gemini);
  return finished("gemini", model, geminiInlineImage(data));
}

/** The image part of a generateContent answer. A safety block has none. */
export function geminiInlineImage(data: any): { buffer: Buffer; mimeType: string } {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      const inline = part?.inlineData;
      if (inline && typeof inline.data === "string" && inline.data) {
        return {
          buffer: Buffer.from(inline.data, "base64"),
          mimeType: readMimeType(inline.mimeType),
        };
      }
    }
  }
  throw new ImageUpstreamError();
}

// ─── Qwen: native Wan multimodal-generation route ────────────────────────────

/** Origin of QWEN_BASE_URL, with the plan host as the default: the native path is not under it. */
export function qwenImageEndpoint(): string {
  const configured = (process.env.QWEN_BASE_URL || "").trim();
  let origin = QWEN_DEFAULT_ORIGIN;
  if (configured) {
    try {
      origin = new URL(configured).origin;
    } catch {
      origin = QWEN_DEFAULT_ORIGIN;
    }
  }
  return `${origin}${QWEN_IMAGE_PATH}`;
}

/**
 * Native Wan body. Reference photos go in as `image` content items ahead of the
 * `text` item, which is the multimodal-generation editing shape.
 */
export function qwenImageBody(prompt: string, model: string, aspectRatio: AspectRatio, references: ImageReference[] = []): Record<string, unknown> {
  return {
    model,
    input: { messages: [{ role: "user", content: [...referenceContent(references), { text: prompt }] }] },
    parameters: { size: QWEN_SIZES[aspectRatio], n: 1, watermark: false },
  };
}

/** One `data:` image item per reference, ahead of the text item. */
export function referenceContent(references: ImageReference[]): Record<string, unknown>[] {
  return references.map((image) => ({ image: `data:${image.mimeType};base64,${image.bytes.toString("base64")}` }));
}

async function qwenImage(job: ImageJob): Promise<GeneratedImage> {
  const key = apiKeyFor("qwen");
  if (!key) throw new ImageNotConfiguredError(ENGINE_LABELS.qwen);

  const model = imageModel("qwen", job.quality);
  const data = await postJson(
    qwenImageEndpoint(),
    { Authorization: `Bearer ${key}` },
    qwenImageBody(job.prompt, model, job.aspectRatio, job.references ?? []),
    PROVIDER_TIMEOUTS_MS.qwen
  );

  // The answer carries a temporary hosted URL; the bytes are ours within seconds.
  const imageUrl = qwenImageUrl(data);
  if (!imageUrl) throw new ImageUpstreamError();
  return finished("qwen", model, await downloadImage(imageUrl));
}

export function qwenImageUrl(data: any): string {
  const content = data?.output?.choices?.[0]?.message?.content;
  if (!Array.isArray(content)) return "";
  for (const part of content) {
    if (typeof part?.image === "string" && part.image) return part.image;
  }
  return "";
}

// ─── OpenAI: gpt-image-2 through the LiteLLM gateway ─────────────────────────

export function openaiImageEndpoint(): string {
  return `${litellmBaseUrl()}/images/generations`;
}

/** The gateway route that takes reference images: the same answer shape, a form body. */
export function openaiImageEditEndpoint(): string {
  return `${litellmBaseUrl()}/images/edits`;
}

export function openaiImageBody(prompt: string, model: string, aspectRatio: AspectRatio): Record<string, unknown> {
  return { model, prompt, n: 1, size: OPENAI_SIZES[aspectRatio] };
}

/**
 * multipart/form-data body of an edit request: one `image[]` part per reference,
 * then prompt, model and size. The gateway answers with the same `data` array as
 * a generation call, so the reply is read the same way.
 */
export function openaiImageEditForm(prompt: string, model: string, aspectRatio: AspectRatio, references: ImageReference[]): FormData {
  const form = new FormData();
  references.forEach((image, index) => {
    const name = image.filename || `reference-${index + 1}.${extensionFor(image.mimeType) || "png"}`;
    // A copy, not the Buffer itself: BlobPart wants an ArrayBuffer, not a pooled one.
    form.append("image[]", new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }), name);
  });
  form.append("prompt", prompt);
  form.append("model", model);
  form.append("size", OPENAI_SIZES[aspectRatio]);
  return form;
}

async function openaiImage(job: ImageJob): Promise<GeneratedImage> {
  const key = apiKeyFor("litellm");
  if (!key) throw new ImageNotConfiguredError(ENGINE_LABELS.openai);

  const model = imageModel("openai", job.quality);
  const references = job.references ?? [];
  const headers = { Authorization: `Bearer ${key}`, "User-Agent": "sutaeru/1.0" };
  const data = references.length
    ? await postForm(openaiImageEditEndpoint(), headers, openaiImageEditForm(job.prompt, model, job.aspectRatio, references), PROVIDER_TIMEOUTS_MS.openai)
    : await postJson(openaiImageEndpoint(), headers, openaiImageBody(job.prompt, model, job.aspectRatio), PROVIDER_TIMEOUTS_MS.openai);

  const first = Array.isArray(data?.data) ? data.data[0] : undefined;
  if (first && typeof first.b64_json === "string" && first.b64_json) {
    return finished("openai", model, { buffer: Buffer.from(first.b64_json, "base64"), mimeType: "image/png" });
  }
  if (first && typeof first.url === "string" && first.url) {
    return finished("openai", model, await downloadImage(first.url));
  }
  throw new ImageUpstreamError();
}

// ─── Forge: Stable Diffusion on a Jarvislabs GPU, through gpu-manager ────────

/** The manager's URL and shared token, or null when either is missing. */
export function forgeManager(): { url: string; token: string } | null {
  const url = (process.env.FORGE_MANAGER_URL || "").trim().replace(/\/+$/, "");
  const token = (process.env.FORGE_MANAGER_TOKEN || "").trim();
  return url && token ? { url, token } : null;
}

export function isFluxModel(model: string): boolean {
  return model.toLowerCase().includes("flux");
}

/** txt2img body for Forge. The checkpoint is chosen per request, so the manager needs no state. */
export function forgeImageBody(prompt: string, model: string, aspectRatio: AspectRatio): Record<string, unknown> {
  const flux = isFluxModel(model);
  const [width, height] = (flux ? FORGE_FLUX_SIZES : FORGE_SD_SIZES)[aspectRatio];
  const common = { prompt, width, height, batch_size: 1, n_iter: 1, override_settings: { sd_model_checkpoint: model } };
  if (flux) {
    return { ...common, steps: 20, cfg_scale: 1, distilled_cfg_scale: 3.5, sampler_name: "Euler", scheduler: "Simple" };
  }
  return {
    ...common,
    negative_prompt: "cartoon, painting, deformed, disfigured, extra limbs, low quality, watermark, text",
    steps: 28,
    cfg_scale: 6,
    sampler_name: "DPM++ 2M",
    scheduler: "Karras",
  };
}

async function forgeImage(job: ImageJob): Promise<GeneratedImage> {
  const manager = forgeManager();
  if (!manager) throw new ImageNotConfiguredError(ENGINE_LABELS.forge);

  const model = imageModel("forge", job.quality);
  const data = await postJson(
    `${manager.url}/v1/txt2img`,
    { "X-Manager-Token": manager.token },
    forgeImageBody(job.prompt, model, job.aspectRatio),
    PROVIDER_TIMEOUTS_MS.forge
  );

  const b64 = Array.isArray(data?.images) ? data.images[0] : undefined;
  if (typeof b64 !== "string" || !b64) throw new ImageUpstreamError();
  return finished("forge", model, { buffer: Buffer.from(b64, "base64"), mimeType: "image/png" });
}

// ─── Provider plumbing ───────────────────────────────────────────────────────

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<any> {
  return post(url, { "Content-Type": "application/json", ...headers }, JSON.stringify(body), timeoutMs);
}

/**
 * Multipart post for the edit route. The Content-Type is left to fetch: it owns
 * the boundary the server has to match.
 */
async function postForm(url: string, headers: Record<string, string>, body: FormData, timeoutMs: number): Promise<any> {
  return post(url, headers, body, timeoutMs);
}

async function post(url: string, headers: Record<string, string>, body: BodyInit, timeoutMs: number): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (isTimeout(err)) throw new ImageTimeoutError();
    throw new ImageUpstreamError();
  }

  if (!res.ok) {
    // Only the status is kept: a provider body can echo the prompt and the key.
    throw new ImageUpstreamError(res.status);
  }

  try {
    return await res.json();
  } catch {
    throw new ImageUpstreamError();
  }
}

/**
 * Reads a provider-hosted image back as bytes. https only, the SSRF guard of
 * server/lib/fnFetch.ts on every hop, 15 MB cap, 30 s deadline. The URL itself
 * is never returned to the caller.
 */
export async function downloadImage(rawUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ImageUpstreamError();
  }
  if (parsed.protocol !== "https:") throw new ImageUpstreamError();

  // fetchCapped is the SSRF guard: every hop is re-checked, the bytes are capped.
  const work = fetchCapped(parsed.toString(), MAX_IMAGE_BYTES);
  work.catch(() => {}); // the deadline can win first; a late fault is not a second failure
  try {
    const fetched = await withTimeout(work, DOWNLOAD_TIMEOUT_MS);
    return { buffer: fetched.buffer, mimeType: fetched.contentType };
  } catch (err) {
    if (err instanceof ImageTimeoutError) throw err;
    throw new ImageUpstreamError();
  }
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new ImageTimeoutError()), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function finished(engine: EngineId, model: string, image: { buffer: Buffer; mimeType: string }): GeneratedImage {
  if (image.buffer.byteLength === 0 || image.buffer.byteLength > MAX_IMAGE_BYTES) throw new ImageUpstreamError();
  const mimeType = sniffMimeType(image.buffer, image.mimeType);
  const { width, height } = imageDimensions(image.buffer);
  return { engine, model, mimeType, width, height, buffer: image.buffer };
}

/**
 * The bytes decide the type the client is served, because a hosted download
 * reports what its CDN feels like. Anything unrecognised keeps what the engine said.
 */
function sniffMimeType(buffer: Buffer, declared: string): string {
  if (isPng(buffer)) return "image/png";
  if (isJpeg(buffer)) return "image/jpeg";
  return declared;
}

function isPng(buffer: Buffer): boolean {
  return buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47;
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

function isTimeout(err: unknown): boolean {
  const name = (err as { name?: string } | undefined)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

function readMimeType(value: unknown): string {
  const mime = typeof value === "string" ? value.split(";")[0].trim().toLowerCase() : "";
  return mime.startsWith("image/") ? mime : "image/png";
}

/**
 * Pixel size out of the PNG or JPEG header, so the client can size the frame
 * before the bytes have loaded. Any other format reports nothing.
 */
export function imageDimensions(buffer: Buffer): { width?: number; height?: number } {
  try {
    if (isPng(buffer) && buffer.toString("ascii", 12, 16) === "IHDR") {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (isJpeg(buffer)) {
      for (let offset = 2; offset + 9 < buffer.length; ) {
        if (buffer[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = buffer[offset + 1];
        const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isFrame) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          offset += 2;
          continue;
        }
        offset += 2 + buffer.readUInt16BE(offset + 2);
      }
    }
  } catch {
    // A header we cannot read is not worth failing an image over.
  }
  return {};
}

// ─── Storage and usage ───────────────────────────────────────────────────────

/** `GET /files/*` reads the mime type back from the extension, so the two must agree. */
function extensionFor(mimeType: string): string {
  const subtype = (mimeType.split("/")[1] || "").split("+")[0].replace(/[^a-z0-9]/g, "");
  if (subtype === "jpeg") return "jpg";
  return subtype || "png";
}

export interface StoredImage {
  key: string;
  url: string;
  sizeBytes: number;
}

/**
 * Stores the bytes under the caller's own path and files the row that the
 * existing GET /files/* route authorizes by owner, which is what makes the URL
 * readable by this user alone.
 */
export async function storeImage(userId: number, prompt: string, image: GeneratedImage): Promise<StoredImage> {
  const extension = extensionFor(image.mimeType);
  const name = `image-${randomUUID().slice(0, 8)}.${extension}`;
  const fileKey = `users/${userId}/images/${name}`;

  const stored = await getStorageAdapter().put(fileKey, image.buffer, image.mimeType, { userId, name });
  await createFile({
    userId,
    name,
    originalPrompt: prompt,
    // The format column predates images: the video upload uses the same stand-in.
    format: "md",
    kind: "image",
    storageProvider: stored.provider,
    storageRef: stored.key,
    fileKey: stored.key,
    fileUrl: stored.url,
    fileSizeBytes: stored.sizeBytes,
    mimeType: image.mimeType,
  });

  return { key: stored.key, url: stored.url, sizeBytes: stored.sizeBytes };
}

/**
 * One usage row per generated image. logUsage() in server/core/usage.ts prices a
 * row from its tokens and an image carries none, so the same columns are written
 * here with the rough per-image estimate from the table above.
 */
export async function logImageUsage(userId: number, image: GeneratedImage): Promise<void> {
  const database = await getDb();
  if (!database) return;

  try {
    await database.insert(usageLogs).values({
      userId,
      sessionId: null,
      reportId: null,
      provider: image.engine,
      model: image.model,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: String(roughImageCostUsd(image.model)),
      purpose: IMAGE_PURPOSE,
    });
  } catch (err) {
    // Never fail the user request because of a logging hiccup.
    console.warn("[image] failed to log usage:", String(err));
  }
}
