/**
 * Cloud-function replacements. The Lovable client calls
 * `${VITE_SUPABASE_URL}/functions/v1/<name>`; pointing FUNCTIONS_BASE at
 * `/api/fn` sends the same request shapes here instead.
 *
 * Mounted behind the shared requireSession gate in server/_core/index.ts, so
 * `(req as any).user` is the signed-in row and every handler scopes its queries
 * to that user id.
 */

import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { FnError, GENERIC_FAILURE, requireUserId, sendError } from "./shared";
import { handleChatInsights } from "./chatInsights";
import { handleDocumentBrief } from "./documentBrief";
import { handleDrive } from "./drive";
import { handleImage } from "./image";
import { handleMemories } from "./memories";
import { handleMonitors } from "./monitors";
import { handleResearch } from "./research";
import { handleVoice, parseAudio } from "./voice";

type FnHandler = (userId: number, req: Request, res: Response) => Promise<void>;

const functions: Record<string, FnHandler> = {
  memories: handleMemories,
  monitors: handleMonitors,
  "document-brief": handleDocumentBrief,
  "chat-insights": handleChatInsights,
  research: handleResearch,
  voice: handleVoice,
  image: handleImage,
  drive: handleDrive,
};

/** The function names the client calls; anything else is a 404. */
export function resolveFunction(name: string): FnHandler | undefined {
  return Object.hasOwn(functions, name) ? functions[name] : undefined;
}

/** One entry point so the dispatch and the error shape are testable. */
export async function handleFnRequest(req: Request, res: Response): Promise<void> {
  const handler = resolveFunction(req.params.name);
  if (!handler) {
    sendError(res, 404, "Unknown function.");
    return;
  }

  const userId = requireUserId(req);
  await handler(userId, req, res);
}

export const fnRouter = Router();

// parseAudio only engages on a multipart request; JSON bodies stay with express.json.
fnRouter.post("/:name", parseAudio, (req, res, next: NextFunction) => {
  handleFnRequest(req, res).catch(next);
});

fnRouter.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof FnError) {
    sendError(res, err.status, err.message);
    return;
  }
  console.error(`[fn] ${req.path} request failed:`, String(err));
  sendError(res, 500, GENERIC_FAILURE);
});

export default fnRouter;
