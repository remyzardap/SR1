/**
 * Image and video generation tools for the Kemma agent (P1-12, second half).
 *
 * `generate_image` calls the existing image pipeline (generateImage + storeImage),
 * respects the engine resolver (resolveImageEngine), the image rate limits from
 * config/rate-limits.ts and the blocked-prompt check (isBlockedPrompt). It emits
 * an `image` event {url, fileId, prompt, engine}.
 *
 * `generate_video` enqueues a job on the existing video job queue and returns
 * {jobId, status} immediately, emitting a `job` event so the UI can poll.
 *
 * Both tools are registered in builtin/index.ts behind flag("ACTION_TOOLS").
 * Neither requires approval (they only create files in the user's own storage).
 */
import { z } from "zod";
import { registerTool } from "../registry";
import type { ToolContext } from "../types";
import { createErrorResult, createSuccessResult, type LegacyToolResult } from "./legacy";
import {
  ASPECT_RATIOS,
  ENGINE_IDS,
  ENGINE_LABELS,
  QUALITIES,
  generateImage,
  storeImage,
  logImageUsage,
  resolveImageEngine,
  engineAvailable,
  defaultEngine,
  supportsReference,
  type ImageJob,
  type GeneratedImage,
} from "../../../lib/fnImage";
import { isBlockedPrompt } from "../../../lib/sensitive";
import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_ENGINE_IDS,
  VIDEO_ENGINE_LABELS,
  VIDEO_QUALITIES,
  queueVideoJob,
  engineAvailable as videoEngineAvailable,
  defaultVideoEngine,
  resolveVideoEngine,
  clampDuration,
  assertVideoPromptSafe,
  supportsVideoReference,
  type VideoJobParams,
} from "../../../lib/fnVideo";
import { isAdminUser } from "../../../kemma/executors/vpsFiles";

/** How much prompt text reaches the model. */
const MAX_PROMPT_CHARS = 2000;

/** Image arguments. */
const GenerateImageArgs = z.object({
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(MAX_PROMPT_CHARS)
    .describe("What to draw. Be specific: subject, style, lighting, composition."),
  engine: z
    .enum(ENGINE_IDS)
    .optional()
    .describe(`Which engine to use. Default: ${defaultEngine()}.`),
  quality: z
    .enum(QUALITIES)
    .default("standard")
    .describe("standard = faster/cheaper, high = more detail."),
  aspectRatio: z
    .enum(ASPECT_RATIOS)
    .default("1:1")
    .describe("Shape of the image. 1:1 is square, 16:9 is landscape, 9:16 is portrait."),
});

/** Video arguments. */
const GenerateVideoArgs = z.object({
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(MAX_PROMPT_CHARS)
    .describe("What the video should show. Be specific: subject, motion, camera, style."),
  engine: z
    .enum(VIDEO_ENGINE_IDS)
    .optional()
    .describe(`Which engine to use. Default: ${defaultVideoEngine()}.`),
  quality: z
    .enum(VIDEO_QUALITIES)
    .default("standard")
    .describe("standard = faster/cheaper, high = more detail."),
  aspectRatio: z
    .enum(VIDEO_ASPECT_RATIOS)
    .default("16:9")
    .describe("Shape of the video. 16:9 is landscape, 9:16 is portrait, 1:1 is square."),
  durationSec: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Length in seconds. Each engine has its own min/max; the tool clamps to the engine's range."),
});

/** Whether the account has any image engine configured. */
async function anyImageEngineConfigured(): Promise<boolean> {
  for (const engine of ENGINE_IDS) {
    if (engineAvailable(engine)) return true;
  }
  return false;
}

/** Whether the account has any video engine configured. */
async function anyVideoEngineConfigured(): Promise<boolean> {
  for (const engine of VIDEO_ENGINE_IDS) {
    if (videoEngineAvailable(engine)) return true;
  }
  return false;
}

async function executeGenerateImage(
  args: z.infer<typeof GenerateImageArgs>,
  ctx: ToolContext
): Promise<LegacyToolResult> {
  const requestedEngine = args.engine ?? defaultEngine();
  const resolved = await resolveImageEngine({
    prompt: args.prompt,
    engine: requestedEngine,
    isAdmin: () => isAdminUser(ctx.userId),
    hasReferences: false,
  });

  if (resolved.blocked || isBlockedPrompt(args.prompt)) {
    return createErrorResult("I can't help with that.", "BLOCKED_PROMPT");
  }

  if (requestedEngine === "venice" && !(await isAdminUser(ctx.userId))) {
    return createErrorResult("This engine is not available for your account.", "NOT_ALLOWED");
  }

  const engine = resolved.engine;
  if (!engineAvailable(engine)) {
    return createErrorResult(`${ENGINE_LABELS[engine]} is not available right now.`, "ENGINE_UNAVAILABLE");
  }

  const job: ImageJob = {
    prompt: args.prompt,
    engine,
    quality: args.quality,
    aspectRatio: args.aspectRatio,
    references: [],
  };

  try {
    const image = await generateImage(job);
    const stored = await storeImage(ctx.userId, job.prompt, image);
    await logImageUsage(ctx.userId, image);

    ctx.emit({
      type: "image",
      url: stored.url,
      fileId: null,
      prompt: job.prompt,
      engine: job.engine,
    });

    return createSuccessResult({
      engine: image.engine,
      model: image.model,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      url: stored.url,
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "ImageBlockedError") return createErrorResult("I can't help with that.", "BLOCKED_PROMPT");
    if (name === "ImageNotConfiguredError") return createErrorResult(err instanceof Error ? err.message : "Engine not available.", "ENGINE_UNAVAILABLE");
    if (name === "ImageReferenceError") return createErrorResult(err instanceof Error ? err.message : "Reference photos not supported.", "INVALID_ARGS");
    if (name === "ImageTimeoutError") return createErrorResult(err instanceof Error ? err.message : "The image engine timed out. Please try again.", "TIMEOUT");
    if (name === "ImageUpstreamError") return createErrorResult("The image engine failed. Please try again.", "FAILED");
    return createErrorResult("Image generation failed.", "FAILED");
  }
}

async function executeGenerateVideo(
  args: z.infer<typeof GenerateVideoArgs>,
  ctx: ToolContext
): Promise<LegacyToolResult> {
  const requestedEngine = args.engine ?? defaultVideoEngine();
  const engine = resolveVideoEngine(args.prompt, requestedEngine);

  try {
    assertVideoPromptSafe(args.prompt);
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "VideoSafetyError") return createErrorResult(err instanceof Error ? err.message : "I can't help with that.", "BLOCKED_PROMPT");
    throw err;
  }

  if (!videoEngineAvailable(engine)) {
    return createErrorResult(`${VIDEO_ENGINE_LABELS[engine]} is not available right now.`, "ENGINE_UNAVAILABLE");
  }

  const durationSec = clampDuration(engine, args.durationSec);

  const params: VideoJobParams = {
    prompt: args.prompt,
    engine,
    quality: args.quality,
    aspectRatio: args.aspectRatio,
    durationSec,
    references: [],
  };

  try {
    const job = await queueVideoJob(ctx.userId, params);

    ctx.emit({
      type: "job",
      jobId: job.id,
      kind: "video",
      status: job.state,
      etaSeconds: job.etaSeconds,
    });

    return createSuccessResult({
      jobId: job.id,
      status: job.state,
      etaSeconds: job.etaSeconds,
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "VideoReferenceError") return createErrorResult(err instanceof Error ? err.message : "Reference photos not supported.", "INVALID_ARGS");
    if (name === "VideoNotConfiguredError") return createErrorResult(err instanceof Error ? err.message : "Engine not available.", "ENGINE_UNAVAILABLE");
    if (name === "VideoSafetyError") return createErrorResult(err instanceof Error ? err.message : "I can't help with that.", "BLOCKED_PROMPT");
    if (name === "VideoTimeoutError") return createErrorResult(err instanceof Error ? err.message : "The video engine timed out. Please try again.", "TIMEOUT");
    if (name === "VideoUpstreamError") return createErrorResult("The video engine failed. Please try again.", "FAILED");
    return createErrorResult("Video generation failed.", "FAILED");
  }
}

export function registerMediaTools(): void {
  registerTool({
    name: "generate_image",
    description:
      "Generate an image from a text prompt. Returns a URL the user can open. The image is stored in the user's own files.",
    args: GenerateImageArgs,
    risk: "write",
    requiresApproval: false,
    parallelSafe: false,
    timeoutMs: 120_000,
    maxModelChars: 4_000,
    available: anyImageEngineConfigured,
    execute: executeGenerateImage,
  });

  registerTool({
    name: "generate_video",
    description:
      "Start a video generation job from a text prompt. Returns a job id and status immediately; the video completes in the background. Poll with the video status endpoint or wait for the job event.",
    args: GenerateVideoArgs,
    risk: "write",
    requiresApproval: false,
    parallelSafe: false,
    timeoutMs: 30_000,
    maxModelChars: 4_000,
    available: anyVideoEngineConfigured,
    execute: executeGenerateVideo,
  });
}