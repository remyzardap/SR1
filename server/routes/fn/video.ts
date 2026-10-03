/**
 * Video generation function routes (/api/fn/video).
 *
 * Endpoints:
 *   POST /api/fn/video/start   - Enqueue a video generation job
 *   GET  /api/fn/video/status  - Poll status for a job (query ?id=<jobId> or path /:id)
 *   POST /api/fn/video/cancel  - Cancel an active job
 *   GET  /api/fn/video/engines - List available video engines
 *
 * Also supports the cloud-function action dispatch on POST /api/fn/video:
 *   { action: "start", prompt, engine?, quality?, aspectRatio?, durationSec? }
 *   { action: "status", id | jobId }
 *   { action: "cancel", id | jobId }
 *   { action: "engines" }
 */

import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { User } from "../../../drizzle/schema";
import { rateLimitConfig } from "../../config/rate-limits";
import {
  hasDriveAttachment,
  parseReferenceImages,
  referenceLimits,
  requireDriveConnection,
  resolveAttachment,
  type Attachment,
} from "../../lib/attachments";
import { FnError } from "../../lib/fnErrors";
import type { ImageReference } from "../../lib/fnImage";
import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_ENGINE_IDS,
  VIDEO_ENGINE_LABELS,
  VIDEO_QUALITIES,
  VideoNotConfiguredError,
  VideoReferenceError,
  VideoSafetyError,
  assertVideoPromptSafe,
  cancelVideoJob,
  clampDuration,
  defaultVideoEngine,
  engineAvailable,
  getVideoJob,
  listVideoEngines,
  queueVideoJob,
  resolveVideoEngine,
  supportsVideoReference,
  videoModel,
  type VideoAspectRatio,
  type VideoEngineId,
  type VideoQuality,
} from "../../lib/fnVideo";
import { actionOf, asRecord, requireUserId, unknownAction } from "./shared";

export const MAX_VIDEO_PROMPT_CHARS = 2000;

const startVideoSchema = z.object({
  prompt: z.string().trim().min(1).max(MAX_VIDEO_PROMPT_CHARS),
  engine: z.enum(VIDEO_ENGINE_IDS).optional(),
  quality: z.enum(VIDEO_QUALITIES).default("standard"),
  aspectRatio: z.enum(VIDEO_ASPECT_RATIOS).default("16:9"),
  durationSec: z.number().int().positive().optional(),
});

// ─── Rate Limiters ──────────────────────────────────────────────────────────

const videoHourlyRateLimiter = videoWindowLimiter(
  "hourly",
  rateLimitConfig.videoGenerateHourly,
  (max) => `You can generate ${max} videos per hour. Please try again later.`
);

const videoDailyRateLimiter = videoWindowLimiter(
  "daily",
  rateLimitConfig.videoGenerateDaily,
  (max) => `You can generate ${max} videos per day. Please try again tomorrow.`
);

async function enforceVideoLimit(req: Request, res: Response): Promise<void> {
  for (const limiter of [videoHourlyRateLimiter, videoDailyRateLimiter]) {
    await new Promise<void>((resolve, reject) => {
      limiter(req as never, res as never, (err?: unknown) => (err ? reject(err) : resolve()));
    });
  }
}

function videoWindowLimiter(
  scope: string,
  limit: { requests: number; windowMs: number },
  message: (max: number) => string
): (req: Request, res: Response, next: NextFunction) => void {
  const limiter = rateLimit({
    windowMs: limit.windowMs,
    max: limit.requests,
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: (req: Request) => `video:${scope}:user-${(req as Request & { user?: User }).user?.id ?? "unknown"}`,
    handler: (_req: Request, _res: Response, next: NextFunction) => {
      next(new FnError(429, message(limit.requests)));
    },
  });
  return limiter as unknown as (req: Request, res: Response, next: NextFunction) => void;
}

// ─── Route Handlers ─────────────────────────────────────────────────────────

export async function handleStartVideo(userId: number, body: Record<string, unknown>, req: Request, res: Response): Promise<Record<string, unknown>> {
  const parsed = startVideoSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new FnError(400, invalidVideoMessage(issue?.path?.[0], issue?.code));
  }

  const { prompt, quality, aspectRatio } = parsed.data;
  const requestedEngine = parsed.data.engine ?? defaultVideoEngine();
  const engine = resolveVideoEngine(prompt, requestedEngine);

  try {
    assertVideoPromptSafe(prompt);
  } catch (err) {
    if (err instanceof VideoSafetyError) throw new FnError(400, err.message);
    throw err;
  }

  const sources = parseReferenceImages(body.referenceImages);
  if (sources.length && !supportsVideoReference(engine)) {
    throw new FnError(400, `${VIDEO_ENGINE_LABELS[engine]} cannot use reference photos yet.`);
  }
  if (sources.length && hasDriveAttachment(sources)) {
    await requireDriveConnection(userId);
  }

  if (!engineAvailable(engine)) {
    throw new FnError(503, `${VIDEO_ENGINE_LABELS[engine]} is not available right now.`);
  }

  await enforceVideoLimit(req, res);

  const references: ImageReference[] = [];
  for (const source of sources) {
    try {
      const file = await resolveAttachment(userId, source, referenceLimits());
      references.push({ filename: file.filename, mimeType: file.mediaType, bytes: file.bytes });
    } catch (err) {
      if (err instanceof FnError) throw err;
      throw new FnError(400, "That reference photo could not be read.");
    }
  }

  const durationSec = clampDuration(engine, parsed.data.durationSec);

  const job = await queueVideoJob(userId, {
    prompt,
    engine,
    quality,
    aspectRatio,
    durationSec,
    references,
  });

  return {
    ok: true,
    jobId: job.id,
    state: job.state,
    etaSeconds: job.etaSeconds,
  };
}

export function handleGetVideoStatus(userId: number, jobId: string): Record<string, unknown> {
  if (!jobId) throw new FnError(400, "Job id is required.");

  const job = getVideoJob(jobId);
  if (!job || job.userId !== userId) {
    throw new FnError(404, "Video job not found.");
  }

  return {
    id: job.id,
    state: job.state,
    progress: job.progress,
    etaSeconds: job.etaSeconds,
    videoUrl: job.videoUrl,
    fileId: job.fileId,
    error: job.error,
    engine: job.params.engine,
    model: videoModel(job.params.engine, job.params.quality),
  };
}

export async function handleCancelVideo(userId: number, jobId: string): Promise<Record<string, unknown>> {
  if (!jobId) throw new FnError(400, "Job id is required.");

  const ok = await cancelVideoJob(userId, jobId);
  if (!ok) {
    const job = getVideoJob(jobId);
    if (!job || job.userId !== userId) throw new FnError(404, "Video job not found.");
    return { ok: false, message: "Job is already finished or cancelled." };
  }

  return { ok: true };
}

// ─── Unified Fn Handler for POST /api/fn/video ─────────────────────────────

export async function handleVideo(userId: number, req: Request, res: Response): Promise<void> {
  const body = asRecord(req.body);
  const action = actionOf(body);

  switch (action) {
    case "engines":
      res.json({ engines: listVideoEngines() });
      return;
    case "start":
    case "generate":
      res.json(await handleStartVideo(userId, body, req, res));
      return;
    case "status": {
      const id = String(body.id || body.jobId || req.query.id || "");
      res.json(handleGetVideoStatus(userId, id));
      return;
    }
    case "cancel": {
      const id = String(body.id || body.jobId || req.query.id || "");
      res.json(await handleCancelVideo(userId, id));
      return;
    }
    default:
      unknownAction(action);
  }
}

// ─── Express Router ─────────────────────────────────────────────────────────

export const videoRouter = Router();

videoRouter.get("/engines", (_req: Request, res: Response) => {
  res.json({ engines: listVideoEngines() });
});

videoRouter.post("/start", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const body = asRecord(req.body);
    res.json(await handleStartVideo(userId, body, req, res));
  } catch (err) {
    next(err);
  }
});

videoRouter.get("/status", (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const id = String(req.query.id || req.query.jobId || "");
    res.json(handleGetVideoStatus(userId, id));
  } catch (err) {
    next(err);
  }
});

videoRouter.get("/status/:id", (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    res.json(handleGetVideoStatus(userId, req.params.id));
  } catch (err) {
    next(err);
  }
});

videoRouter.get("/:id", (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    res.json(handleGetVideoStatus(userId, req.params.id));
  } catch (err) {
    next(err);
  }
});

videoRouter.post("/cancel", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const body = asRecord(req.body);
    const id = String(body.id || body.jobId || req.query.id || "");
    res.json(await handleCancelVideo(userId, id));
  } catch (err) {
    next(err);
  }
});

videoRouter.post("/:id/cancel", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    res.json(await handleCancelVideo(userId, req.params.id));
  } catch (err) {
    next(err);
  }
});

// Cloud-function style fallback when POST / is hit on the video router
videoRouter.post("/", (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    handleVideo(userId, req, res).catch(next);
  } catch (err) {
    next(err);
  }
});

// ─── Formatting helpers ─────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  prompt: "Prompt",
  engine: "Engine",
  quality: "Quality",
  aspectRatio: "Aspect ratio",
  durationSec: "Duration",
};

function invalidVideoMessage(field: unknown, code: unknown): string {
  const label = FIELD_LABELS[typeof field === "string" ? field : ""] ?? "Request";
  if (code === "too_small") return `${label} is required.`;
  if (code === "too_big") return `${label} is too long (max ${MAX_VIDEO_PROMPT_CHARS}).`;
  return `${label} is not valid.`;
}
