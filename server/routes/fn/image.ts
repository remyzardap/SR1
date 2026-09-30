/**
 * image function (POST /api/fn/image).
 *
 *   { action: "engines" }  -> { engines: [{ id, label, model, qualityModel, available, defaultEngine }] }
 *   { action: "generate", prompt, engine?, quality?, aspectRatio? }
 *                          -> { engine, model, mimeType, width?, height?, imageUrl }
 *
 * Text to image only, one image per request, on the engine the caller picked.
 * An engine that is not configured is a 503, never a quiet switch to another
 * one: the user chose, and each engine costs money.
 */

import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { User } from "../../../drizzle/schema";
import { rateLimitConfig } from "../../config/rate-limits";
import { FnError } from "../../lib/fnErrors";
import {
  ASPECT_RATIOS,
  ENGINE_IDS,
  ENGINE_LABELS,
  QUALITIES,
  ImageNotConfiguredError,
  ImageTimeoutError,
  ImageUpstreamError,
  defaultEngine,
  engineAvailable,
  generateImage,
  listEngines,
  logImageUsage,
  storeImage,
  type GeneratedImage,
  type ImageJob,
} from "../../lib/fnImage";
import { actionOf, asRecord, unknownAction } from "./shared";

export const MAX_PROMPT_CHARS = 2000;

const generateSchema = z.object({
  prompt: z.string().trim().min(1).max(MAX_PROMPT_CHARS),
  engine: z.enum(ENGINE_IDS).optional(),
  quality: z.enum(QUALITIES).default("standard"),
  aspectRatio: z.enum(ASPECT_RATIOS).default("1:1"),
});

/**
 * The two windows, declared in server/config/rate-limits.ts and enforced with
 * the limiter the auth routes already use. Both are keyed on the signed-in user
 * rather than the IP, because the cost of an image is per account.
 */
const imageHourlyRateLimiter = imageWindowLimiter(
  "hourly",
  rateLimitConfig.imageGenerateHourly,
  (max) => `You can generate ${max} images per hour. Please try again later.`
);
const imageDailyRateLimiter = imageWindowLimiter(
  "daily",
  rateLimitConfig.imageGenerateDaily,
  (max) => `You can generate ${max} images per day. Please try again tomorrow.`
);

export async function handleImage(userId: number, req: Request, res: Response): Promise<void> {
  const body = asRecord(req.body);
  const action = actionOf(body);

  switch (action) {
    case "engines":
      res.json({ engines: listEngines() });
      return;
    case "generate":
      res.json(await generate(userId, body, req, res));
      return;
    default:
      unknownAction(action);
  }
}

async function generate(userId: number, body: Record<string, unknown>, req: Request, res: Response): Promise<Record<string, unknown>> {
  const job = readJob(body);

  if (!engineAvailable(job.engine)) {
    throw new FnError(503, `${ENGINE_LABELS[job.engine]} is not available right now.`);
  }

  await enforceImageLimit(req, res);

  try {
    const image = await generateImage(job);
    const stored = await storeImage(userId, job.prompt, image);
    void logImageUsage(userId, image);
    return responseBody(image, stored.url);
  } catch (err) {
    throw toFnError(err);
  }
}

/** Validates the generate body and fills in the defaults the client may omit. */
export function readJob(body: Record<string, unknown>): ImageJob {
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new FnError(400, invalidMessage(issue?.path?.[0], issue?.code));
  }
  return {
    prompt: parsed.data.prompt,
    engine: parsed.data.engine ?? defaultEngine(),
    quality: parsed.data.quality,
    aspectRatio: parsed.data.aspectRatio,
  };
}

/** Field names as a 400 message shows them; nothing the caller sent is echoed back. */
const FIELD_LABELS: Record<string, string> = { prompt: "Prompt", engine: "Engine", quality: "Quality", aspectRatio: "Aspect ratio" };

/** 400 wording in the shape the other functions use. */
function invalidMessage(field: unknown, code: unknown): string {
  const label = FIELD_LABELS[typeof field === "string" ? field : ""] ?? "Request";
  if (code === "too_small") return `${label} is required.`;
  if (code === "too_big") return `${label} is too long (max ${MAX_PROMPT_CHARS}).`;
  return `${label} is not valid.`;
}

function responseBody(image: GeneratedImage, imageUrl: string): Record<string, unknown> {
  const out: Record<string, unknown> = { engine: image.engine, model: image.model, mimeType: image.mimeType, imageUrl };
  // The size is reported only when the engine could read it back from the bytes.
  if (image.width && image.height) {
    out.width = image.width;
    out.height = image.height;
  }
  return out;
}

/**
 * Engine faults only. The upstream status goes to the log, never to the client;
 * anything else is left for the router to answer as a 500.
 */
function toFnError(err: unknown): unknown {
  if (err instanceof FnError) return err;
  if (err instanceof ImageNotConfiguredError) return new FnError(503, err.message);
  if (err instanceof ImageTimeoutError) return new FnError(504, err.message);
  if (err instanceof ImageUpstreamError) {
    console.error(`[fn:image] generation failed upstream${err.providerStatus ? ` (status ${err.providerStatus})` : ""}`);
    return new FnError(502, "The image engine failed. Please try again.");
  }
  return err;
}

/** Both windows have to agree before an image is paid for. */
async function enforceImageLimit(req: Request, res: Response): Promise<void> {
  for (const limiter of [imageHourlyRateLimiter, imageDailyRateLimiter]) {
    await new Promise<void>((resolve, reject) => {
      limiter(req as never, res as never, (err?: unknown) => (err ? reject(err) : resolve()));
    });
  }
}

/**
 * A blocked caller would be answered by the limiter itself; here the fault comes
 * back through next() instead, so the reply keeps the shared `{ error }` shape
 * and the function router stays the only place that writes responses. The
 * RateLimit headers are off: two windows share one response and would overwrite
 * each other, so the 429 body is the honest place to look.
 */
function imageWindowLimiter(
  scope: string,
  limit: { requests: number; windowMs: number },
  message: (max: number) => string
): (req: Request, res: Response, next: NextFunction) => void {
  const limiter = rateLimit({
    windowMs: limit.windowMs,
    max: limit.requests,
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: (req: Request) => `image:${scope}:user-${(req as Request & { user?: User }).user?.id ?? "unknown"}`,
    handler: (_req: Request, _res: Response, next: NextFunction) => {
      next(new FnError(429, message(limit.requests)));
    },
  });
  return limiter as unknown as (req: Request, res: Response, next: NextFunction) => void;
}
