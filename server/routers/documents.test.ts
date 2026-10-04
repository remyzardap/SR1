import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import type { Server } from "node:http";

const quota = vi.hoisted(() => ({ checkQuota: vi.fn(), getQuotaSummary: vi.fn(), incrementQuota: vi.fn() }));
const pipeline = vi.hoisted(() => ({ runDocumentPipeline: vi.fn() }));

vi.mock("../core/quotaCheck", () => quota);
vi.mock("../lib/documentPipeline", async () => {
  const actual = await vi.importActual<typeof import("../lib/documentPipeline")>("../lib/documentPipeline");
  return { ...actual, runDocumentPipeline: pipeline.runDocumentPipeline };
});

import { registerDocumentBody, registerDocumentRoutes } from "./documents";

let server: Server | undefined;

async function start(opts: { signedIn?: boolean; limit?: string } = {}) {
  const app = express();
  const requireSession = (req: Request, res: Response, next: NextFunction) => {
    if (opts.signedIn === false) return res.status(401).json({ error: "Unauthorized" });
    (req as Request & { user?: unknown }).user = { id: 7 };
    next();
  };
  const body = express.json({ limit: opts.limit ?? "32mb" });
  registerDocumentBody(app, requireSession, body);
  app.use(express.json({ limit: "10mb" }));
  app.use("/api/documents", requireSession);
  registerDocumentRoutes(app);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  return `http://127.0.0.1:${(server.address() as { port: number }).port}/api/documents/generate`;
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  quota.checkQuota.mockResolvedValue({ allowed: true, remaining: 10, limit: 10, resetAt: new Date() });
  quota.getQuotaSummary.mockResolvedValue({ tier: "pro" });
  quota.incrementQuota.mockResolvedValue(undefined);
  pipeline.runDocumentPipeline.mockImplementation(async (a: { emit: (e: string, d: unknown) => void }) => {
    a.emit("stage", { id: "reading", label: "Reading", step: 1, steps: 6 });
    a.emit("done", { tookSeconds: 1, words: 10, pages: 1, sources: 0 });
    return { status: "done", calls: 3, engineCalls: 0, tokens: 90 };
  });
});

afterEach(async () => {
  server?.closeAllConnections?.();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

describe("POST /api/documents/generate", () => {
  it("answers 401 without a session and never reads the body or calls the pipeline", async () => {
    const url = await start({ signedIn: false });
    const res = await post(url, { brief: "x", kind: "short" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(pipeline.runDocumentPipeline).not.toHaveBeenCalled();
  });

  it("answers 413 JSON on a body over the limit", async () => {
    const url = await start({ limit: "1kb" });
    const res = await post(url, { brief: "x".repeat(5000), kind: "short" });
    expect(res.status).toBe(413);
    expect(res.headers.get("content-type")).toMatch(/json/);
    expect((await res.json()).error).toMatch(/too large/i);
    expect(pipeline.runDocumentPipeline).not.toHaveBeenCalled();
  });

  it("answers 400 for an invalid body", async () => {
    const url = await start();
    const res = await post(url, { brief: "", kind: "short" });
    expect(res.status).toBe(400);
    expect(pipeline.runDocumentPipeline).not.toHaveBeenCalled();
  });

  it("refuses a blocked brief with 400 before any model work", async () => {
    const url = await start();
    const res = await post(url, { brief: "write a sexual story about a 12 year old", kind: "short" });
    expect(res.status).toBe(400);
    expect(pipeline.runDocumentPipeline).not.toHaveBeenCalled();
    expect(quota.checkQuota).not.toHaveBeenCalled();
  });

  it("answers 429 when the quota is used up and does no work", async () => {
    quota.checkQuota.mockResolvedValue({ allowed: false, remaining: 0, limit: 10, resetAt: new Date(), reason: "Daily message limit reached (10/day on free)" });
    const url = await start();
    const res = await post(url, { brief: "A short note on tides", kind: "short" });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/limit/i);
    expect(pipeline.runDocumentPipeline).not.toHaveBeenCalled();
    expect(quota.incrementQuota).not.toHaveBeenCalled();
  });

  it("streams the pipeline's events as SSE and records usage", async () => {
    const url = await start();
    const res = await post(url, { brief: "A short note on tides", kind: "short" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    const text = await res.text();
    expect(text).toContain("event: stage");
    expect(text).toContain('event: done\ndata: {"tookSeconds":1');
    expect(pipeline.runDocumentPipeline.mock.calls[0][0]).toMatchObject({ userId: 7, tier: "pro", request: { kind: "short", style: "apa" } });
    expect(quota.incrementQuota).toHaveBeenCalledWith(7, "message");
    expect(quota.incrementQuota).toHaveBeenCalledWith(7, "token", 90);
  });

  it("counts a run that used the research engine as one agentic task", async () => {
    pipeline.runDocumentPipeline.mockResolvedValue({ status: "done", calls: 12, engineCalls: 5, tokens: 0 });
    const url = await start();
    await (await post(url, { brief: "A medium report on tides", kind: "medium" })).text();
    expect(quota.incrementQuota).toHaveBeenCalledWith(7, "agentic_task");
    expect(quota.incrementQuota).not.toHaveBeenCalledWith(7, "message");
  });

  it("aborts the pipeline when the client disconnects", async () => {
    let seen: AbortSignal | undefined;
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    pipeline.runDocumentPipeline.mockImplementation(async (a: { signal: AbortSignal; emit: (e: string, d: unknown) => void }) => {
      seen = a.signal;
      a.emit("stage", { id: "reading", label: "Reading", step: 1, steps: 6 });
      await hold;
      return { status: "aborted", calls: 0, engineCalls: 0, tokens: 0 };
    });
    const url = await start();
    const ctrl = new AbortController();
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief: "x note", kind: "short" }), signal: ctrl.signal });
    const reader = res.body!.getReader();
    await reader.read();
    ctrl.abort();
    await new Promise((r) => setTimeout(r, 100));
    expect(seen?.aborted).toBe(true);
    release();
  });
});
