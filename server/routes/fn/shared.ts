/**
 * Shared plumbing for the Lovable cloud-function replacements mounted at
 * POST /api/fn/:name. Error bodies are always `{ error: string }` with a status
 * code, matching what client/src/lib/kemmaCloud.ts parses.
 */

import type { Request, Response } from "express";
import type { User } from "../../../drizzle/schema";
import { FnError } from "../../lib/fnErrors";

export { FnError } from "../../lib/fnErrors";

export const GENERIC_FAILURE = "The request failed. Please try again.";

/** The signed-in user id: every query in these functions is scoped to it. */
export function requireUserId(req: Request): number {
  const user = (req as Request & { user?: User }).user;
  if (!user || typeof user.id !== "number") throw new FnError(401, "Sign in to continue.");
  return user.id;
}

export function sendError(res: Response, status: number, message: string): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.status(status).json({ error: message });
}

// ─── Body readers ─────────────────────────────────────────────────────────────

export function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new FnError(400, "A JSON body is required.");
  }
  return body as Record<string, unknown>;
}

/** The action selector every non-streaming function body carries. */
export function actionOf(body: Record<string, unknown>): string {
  return requireText(body, "action", 64);
}

export function unknownAction(action: string): never {
  throw new FnError(400, `Unknown action: ${safeLabel(action)}`);
}

/** Strips anything that should not be echoed back into an error message. */
export function safeLabel(value: string): string {
  return value.replace(/[^\w]/g, "").slice(0, 40);
}

export function requireText(obj: Record<string, unknown>, key: string, max: number, min = 1): string {
  const raw = obj[key];
  if (typeof raw !== "string") throw new FnError(400, `${label(key)} is required.`);
  const value = raw.trim();
  if (value.length < min) throw new FnError(400, `${label(key)} is too short.`);
  if (value.length > max) throw new FnError(400, `${label(key)} is too long (max ${max}).`);
  return value;
}

export function optionalText(obj: Record<string, unknown>, key: string, max: number): string | undefined {
  const raw = obj[key];
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") throw new FnError(400, `${label(key)} is not valid.`);
  const value = raw.trim();
  if (value.length > max) throw new FnError(413, `${label(key)} is too large (max ${max}).`);
  return value || undefined;
}

export function requireBoolean(obj: Record<string, unknown>, key: string): boolean {
  const raw = obj[key];
  if (typeof raw !== "boolean") throw new FnError(400, `${label(key)} is required.`);
  return raw;
}

/** A positive integer id (memory rows). Accepts the numeric form the client sends. */
export function requireIntegerId(obj: Record<string, unknown>, key: string): number {
  const raw = obj[key];
  const value = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : raw;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new FnError(400, `${label(key)} is not valid.`);
  }
  return value;
}

/** An opaque row id (monitor rows). */
export function requireStringId(obj: Record<string, unknown>, key: string): string {
  return requireText(obj, key, 64);
}

export function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], key: string): T {
  if (typeof value !== "string") throw new FnError(400, `${label(key)} is required.`);
  const trimmed = value.trim() as T;
  if (!allowed.includes(trimmed)) throw new FnError(400, `${label(key)} is not valid.`);
  return trimmed;
}

function label(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// ─── Server-sent events ───────────────────────────────────────────────────────

export function startSse(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
}

/** Named event with a JSON payload. The names are exactly what kemmaCloud.ts dispatches on. */
export function writeSseEvent(res: Response, event: "token" | "done" | "error", data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Unnamed data line, used by the speech-to-text stream, which reads data only. */
export function writeSseData(res: Response, data: unknown): void {
  res.write(`data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`);
}

/** Keeps a long stream alive through the proxy; call the returned function when done. */
export function startHeartbeat(res: Response): () => void {
  const timer = setInterval(() => {
    if (!res.writableEnded) res.write(": keep-alive\n\n");
  }, 20000);
  return () => clearInterval(timer);
}
