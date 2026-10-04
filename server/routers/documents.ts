/**
 * Documents: POST /api/documents/generate (SSE).
 *
 * Mounted behind requireSession with the 32 MB attachment-sized JSON parser (see server/_core/index.ts),
 * because sources travel as base64 inside the body. The pipeline lives in server/lib/documentPipeline.ts.
 */

import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import type { User } from "../../drizzle/schema";
import { checkQuota, getQuotaSummary, incrementQuota } from "../core/quotaCheck";
import { FnError } from "../lib/fnErrors";
import { isBlockedPrompt, BLOCKED_MESSAGE } from "../lib/sensitive";
import { parseGenerateRequest, runDocumentPipeline } from "../lib/documentPipeline";
import { sendError, startHeartbeat, startSse } from "../routes/fn/shared";

export const DOCUMENTS_GENERATE_PATH = "/api/documents/generate";

/**
 * Session gate, large body parser and the 413 answer for the generate path. Called from index.ts BEFORE the
 * global 10 MB parser, so an anonymous caller can never make the server read a large body.
 */
export function registerDocumentBody(app: Express, requireSession: RequestHandler, bodyParser: RequestHandler): void {
  app.post(DOCUMENTS_GENERATE_PATH, requireSession, bodyParser);
  app.use(DOCUMENTS_GENERATE_PATH, (err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err?.type === "entity.too.large") {
      return res.status(413).json({ error: "That upload is too large. Keep sources under 20 MB in total." });
    }
    next(err);
  });
}

export async function handleDocumentGenerate(req: Request, res: Response): Promise<void> {
  const user = (req as Request & { user?: User }).user;
  if (!user || typeof user.id !== "number") {
    sendError(res, 401, "Unauthorized");
    return;
  }
  const userId = user.id;

  let request;
  try {
    request = parseGenerateRequest(req.body);
  } catch (err) {
    if (err instanceof FnError) return sendError(res, err.status, err.message);
    return sendError(res, 400, "That request is not valid.");
  }
  // Refused before any model call, whatever provider is configured.
  if (isBlockedPrompt(request.brief)) return sendError(res, 400, BLOCKED_MESSAGE);

  let tier;
  try {
    const msgCheck = await checkQuota(userId, "message");
    if (!msgCheck.allowed) return sendError(res, 429, msgCheck.reason ?? "Daily message limit reached");
    tier = (await getQuotaSummary(userId)).tier;
  } catch (err) {
    console.error("[documents] quota check failed:", err instanceof Error ? err.message : err);
    return sendError(res, 500, "The request failed. Please try again.");
  }

  startSse(res);
  const stopHeartbeat = startHeartbeat(res);
  const controller = new AbortController();
  // Node destroys the request stream once its body is read, while this response is still open: only a
  // response closed before our own end(), or a request that gave up mid-upload, means the client left.
  const gone = () => {
    stopHeartbeat();
    controller.abort();
  };
  req.on("close", () => { if (!req.readableEnded) gone(); });
  res.on("close", () => { if (!res.writableEnded) gone(); });

  const send = (event: string, data: unknown) => {
    if (!controller.signal.aborted && !res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await runDocumentPipeline({ userId, tier, request, emit: send, signal: controller.signal });
    // The engine counts its own messages. A run that never reached it is one message; one that did is one task.
    try {
      if (result.engineCalls > 0) await incrementQuota(userId, "agentic_task");
      else if (result.calls > 0) await incrementQuota(userId, "message");
      if (result.tokens > 0) await incrementQuota(userId, "token", result.tokens);
    } catch (err) {
      console.warn("[documents] could not record usage:", err instanceof Error ? err.message : err);
    }
  } catch (err) {
    console.error("[documents] unexpected failure:", err instanceof Error ? err.message : err);
    send("error", { message: "The document could not be completed. Please try again." });
  } finally {
    stopHeartbeat();
    if (!res.writableEnded) res.end();
  }
}

export function registerDocumentRoutes(app: Express): void {
  app.post(DOCUMENTS_GENERATE_PATH, (req, res) => {
    void handleDocumentGenerate(req, res);
  });
}
