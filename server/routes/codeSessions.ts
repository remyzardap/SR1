import express, { Router, type NextFunction, type Request, type Response } from "express";
import speakeasy from "speakeasy";
import { getUserById } from "../db";
import { FnError } from "../lib/fnErrors";
import { parseAttachments, resolveAttachment } from "../lib/attachments";
import { logAuditEvent } from "../middleware/audit-logging";

/**
 * Code mode: headless Claude Code on the VPS, driven from the phone.
 * The session daemon (/root/session-manager, systemd unit session-manager) does the work; this router only
 * checks who is asking and relays. Owner-only, needs two-factor on the account, and has a kill switch.
 * Mounted at /api/admin/code-sessions behind the session gate.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_PROMPT = 8000;

export function allowedModes(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return env.CODE_SESSIONS_FULL === "1" ? new Set(["read", "edit", "full"]) : new Set(["read", "edit"]);
}

/** Project folders a session may start in, as "name:/path" pairs. The client sends the name, never a path. */
export function codeProjects(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (env.CODE_SESSIONS_PROJECTS || "sutaeru:/root/sr1").split(",")) {
    const i = pair.indexOf(":");
    const name = pair.slice(0, i).trim();
    const path = pair.slice(i + 1).trim();
    if (i > 0 && name && path.startsWith("/root/")) out[name] = path;
  }
  return out;
}

export function codeSessionsGate(user: any, env: NodeJS.ProcessEnv = process.env): { ok: true } | { ok: false; reason: string; message: string } {
  if (user?.role !== "admin") return { ok: false, reason: "admin", message: "Admin only." };
  if (env.CODE_SESSIONS_ENABLED !== "1") return { ok: false, reason: "disabled", message: "Code mode is switched off." };
  if (!env.CODE_SESSIONS_URL || !env.CODE_SESSIONS_TOKEN) return { ok: false, reason: "unconfigured", message: "Code mode is not configured on this server." };
  if (!user.totpEnabled) return { ok: false, reason: "2fa", message: "Turn on two-factor sign-in before using code sessions." };
  return { ok: true };
}

async function daemon(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; data: any }> {
  const base = (process.env.CODE_SESSIONS_URL || "").replace(/\/+$/, "");
  try {
    const r = await fetch(base + path, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${process.env.CODE_SESSIONS_TOKEN}`, "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(15_000),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  } catch {
    return { status: 502, data: { error: "The session service is not reachable." } };
  }
}

export const codeSessionsRouter = Router();

// Large body parser for attachment uploads (up to 32 MB body for 20 MB decoded payload)
const attachmentBody = express.json({
  limit: "32mb",
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf;
  },
});

function handleAttachment413(err: any, _req: Request, res: Response, next: NextFunction) {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "That upload is too large. Keep attachments under 20 MB in total." });
  }
  next(err);
}

codeSessionsRouter.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Cache-Control", "no-store");
  const gate = codeSessionsGate((req as any).user);
  if (!gate.ok) return res.status(403).json({ error: gate.message, reason: gate.reason });
  next();
});

const audit = (req: Request, action: string, id?: string, metadata?: Record<string, unknown>) =>
  logAuditEvent({ userId: String((req as any).user.id), action: `code_session.${action}`, resourceType: "code_session", resourceId: id, metadata });

function reply(res: Response, r: { status: number; data: any }) {
  res.status(r.status).json(r.data);
}

function sessionId(req: Request, res: Response): string | null {
  const id = String(req.params.id);
  if (!UUID.test(id)) { res.status(400).json({ error: "Bad session id." }); return null; }
  return id;
}

export async function extractAttachments(req: Request): Promise<{
  attachments?: Array<{ filename: string; mediaType: string; dataUrl: string }>;
  error?: { status: number; message: string };
}> {
  if (req.body?.attachments === undefined || req.body?.attachments === null) {
    return {};
  }
  try {
    const parsed = parseAttachments(req.body.attachments);
    const userId = (req as any).user?.id;
    const resolved = await Promise.all(
      parsed.map(async (att) => {
        if (att.source === "device") {
          return { filename: att.filename, mediaType: att.mediaType, dataUrl: att.dataUrl };
        }
        if (userId) {
          const r = await resolveAttachment(userId, att);
          return { filename: r.filename, mediaType: r.mediaType, dataUrl: `data:${r.mediaType};base64,${r.bytes.toString("base64")}` };
        }
        throw new FnError(400, "Google Drive attachments require user session.");
      })
    );
    return { attachments: resolved };
  } catch (err: any) {
    const status = err instanceof FnError ? err.status : 400;
    return { error: { status, message: err.message || "Invalid attachments." } };
  }
}

codeSessionsRouter.get("/status", async (_req, res) => {
  const h = await daemon("/health");
  const fullAvailable = process.env.CODE_SESSIONS_FULL === "1";
  res.json({
    ok: h.status === 200,
    providers: h.data?.providers ?? [],
    projects: Object.keys(codeProjects()),
    modes: fullAvailable ? ["read", "edit", "full"] : ["read", "edit"],
    fullAvailable,
  });
});

codeSessionsRouter.get("/", async (_req, res) => {
  reply(res, await daemon("/sessions"));
});

codeSessionsRouter.post("/", attachmentBody, handleAttachment413, async (req: Request, res: Response) => {
  const attResult = await extractAttachments(req);
  if (attResult.error) return res.status(attResult.error.status).json({ error: attResult.error.message });
  const hasAttachments = Boolean(attResult.attachments && attResult.attachments.length > 0);

  const prompt = (typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "") || (hasAttachments ? "Inspect the attached files." : "");
  const mode = req.body?.mode ?? "read";
  const projects = codeProjects();
  const project = req.body?.project ?? Object.keys(projects)[0];
  const validModes = allowedModes();

  if (!prompt || prompt.length > MAX_PROMPT) return res.status(400).json({ error: `Write a task of up to ${MAX_PROMPT} characters.` });
  if (!validModes.has(mode)) return res.status(400).json({ error: validModes.has("full") ? "Mode must be read, edit, or full." : "Mode must be read or edit." });
  if (!projects[project]) return res.status(400).json({ error: "Unknown project." });

  if (mode === "full") {
    if (process.env.CODE_SESSIONS_FULL !== "1") {
      return res.status(400).json({ error: "Full access mode is not enabled on this server." });
    }
    const totp = typeof req.body?.totp === "string" ? req.body.totp.trim() : "";
    if (!totp || !/^\d{6}$/.test(totp)) {
      return res.status(400).json({ error: "A 6-digit two-factor code is required for full access." });
    }
    const userId = Number((req as any).user?.id);
    const user = await getUserById(userId);
    if (!user?.totpSecret || !user.totpEnabled) {
      return res.status(400).json({ error: "Two-factor sign-in must be enabled on your account." });
    }
    const isValid = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: "base32",
      token: totp,
      window: 1,
    });
    if (!isValid) {
      return res.status(401).json({ error: "Invalid two-factor code." });
    }
  }

  const budget = Number(req.body?.budgetUsd);
  const effectiveBudget = Number.isFinite(budget) && budget > 0 ? Math.min(budget, 25) : undefined; // no default spend cap

  const r = await daemon("/sessions", {
    method: "POST",
    body: {
      prompt,
      mode,
      cwd: projects[project],
      ...(effectiveBudget !== undefined ? { budget_usd: effectiveBudget } : {}),
      ...(hasAttachments ? { attachments: attResult.attachments } : {}),
    },
  });
  if (r.status === 200) await audit(req, "start", r.data?.id, { mode, project, prompt: prompt.slice(0, 200) });
  reply(res, r);
});

codeSessionsRouter.get("/:id", async (req, res) => {
  const id = sessionId(req, res);
  if (!id) return;
  const after = Math.max(0, parseInt(String(req.query.after ?? "0"), 10) || 0);
  reply(res, await daemon(`/sessions/${id}?after=${after}`));
});

codeSessionsRouter.post("/:id/message", attachmentBody, handleAttachment413, async (req: Request, res: Response) => {
  const id = sessionId(req, res);
  if (!id) return;

  const attResult = await extractAttachments(req);
  if (attResult.error) return res.status(attResult.error.status).json({ error: attResult.error.message });
  const hasAttachments = Boolean(attResult.attachments && attResult.attachments.length > 0);

  const text = (typeof req.body?.text === "string" ? req.body.text.trim() : "") || (hasAttachments ? "See attached files." : "");
  if (!text || text.length > MAX_PROMPT) return res.status(400).json({ error: `Write a message of up to ${MAX_PROMPT} characters.` });

  const r = await daemon(`/sessions/${id}/message`, {
    method: "POST",
    body: {
      text,
      ...(hasAttachments ? { attachments: attResult.attachments } : {}),
    },
  });
  if (r.status === 200) await audit(req, "message", id, { text: text.slice(0, 200) });
  reply(res, r);
});

codeSessionsRouter.post("/:id/approve", async (req, res) => {
  const id = sessionId(req, res);
  if (!id) return;
  const deny = req.body?.deny === true;
  const r = await daemon(`/sessions/${id}/approve`, { method: "POST", body: { deny } });
  if (r.status === 200) await audit(req, deny ? "deny" : "approve", id);
  reply(res, r);
});

codeSessionsRouter.post("/:id/stop", async (req, res) => {
  const id = sessionId(req, res);
  if (!id) return;
  const r = await daemon(`/sessions/${id}/stop`, { method: "POST", body: {} });
  if (r.status === 200) await audit(req, "stop", id);
  reply(res, r);
});
