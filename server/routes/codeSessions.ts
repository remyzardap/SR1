import { Router, type NextFunction, type Request, type Response } from "express";
import { logAuditEvent } from "../middleware/audit-logging";

/**
 * Code sessions: headless Claude Code on the VPS, driven from the phone.
 * The session daemon (/root/session-manager, systemd unit session-manager) does the work; this router only
 * checks who is asking and relays. Owner-only, needs two-factor on the account, and has a kill switch.
 * Mounted at /api/admin/code-sessions behind the session gate.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MODES = new Set(["read", "edit"]);
const MAX_PROMPT = 8000;

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
  if (env.CODE_SESSIONS_ENABLED !== "1") return { ok: false, reason: "disabled", message: "Code sessions are switched off." };
  if (!env.CODE_SESSIONS_URL || !env.CODE_SESSIONS_TOKEN) return { ok: false, reason: "unconfigured", message: "Code sessions are not configured on this server." };
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

codeSessionsRouter.get("/status", async (_req, res) => {
  const h = await daemon("/health");
  res.json({ ok: h.status === 200, providers: h.data?.providers ?? [], projects: Object.keys(codeProjects()), modes: ["read", "edit"] });
});

codeSessionsRouter.get("/", async (_req, res) => {
  reply(res, await daemon("/sessions"));
});

codeSessionsRouter.post("/", async (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  const mode = req.body?.mode ?? "read";
  const projects = codeProjects();
  const project = req.body?.project ?? Object.keys(projects)[0];
  if (!prompt || prompt.length > MAX_PROMPT) return res.status(400).json({ error: `Write a task of up to ${MAX_PROMPT} characters.` });
  if (!MODES.has(mode)) return res.status(400).json({ error: "Mode must be read or edit." });
  if (!projects[project]) return res.status(400).json({ error: "Unknown project." });
  const budget = Number(req.body?.budgetUsd);
  const r = await daemon("/sessions", {
    method: "POST",
    body: { prompt, mode, cwd: projects[project], ...(Number.isFinite(budget) && budget > 0 ? { budget_usd: Math.min(budget, 25) } : {}) },
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

codeSessionsRouter.post("/:id/message", async (req, res) => {
  const id = sessionId(req, res);
  if (!id) return;
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text || text.length > MAX_PROMPT) return res.status(400).json({ error: `Write a message of up to ${MAX_PROMPT} characters.` });
  const r = await daemon(`/sessions/${id}/message`, { method: "POST", body: { text } });
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
