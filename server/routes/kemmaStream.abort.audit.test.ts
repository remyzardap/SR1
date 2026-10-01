/**
 * Audit test (area 1): /api/kemma/stream against a real Express server and a real client.
 *
 * Why this exists: the route marks the stream "aborted" from req.on("close"). On Node 20
 * an IncomingMessage is auto-destroyed once its readable side ends, so a JSON body that
 * express.json() has already consumed fires "close" a few ms into the handler while the
 * response is still open. Gating every sendEvent and the final res.end() on that flag
 * leaves Chat.tsx with a stream that delivers nothing and never finishes. Fake req
 * objects with an inert on() cannot see it (kemmaStream.audit.test.ts uses those);
 * the same class was proven and fixed in server/routes/fn/sseAbort.audit.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import type { Server } from "node:http";

const engine = vi.hoisted(() => ({ kemmaExecute: vi.fn() }));
const quota = vi.hoisted(() => ({ getQuotaSummary: vi.fn(), checkQuota: vi.fn() }));
const db = vi.hoisted(() => ({ getChatSessionSettings: vi.fn(), addChatMessage: vi.fn(), ensureChatSession: vi.fn(async () => "owned" as const) }));

vi.mock("../kemma/engine", () => engine);
vi.mock("../core/quotaCheck", () => quota);
vi.mock("../db", () => db);

import { kemmaStreamRoute } from "./kemmaStream";

async function readStream(res: Response, ms: number): Promise<{ body: string; closed: boolean }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let closed = false;
  const deadline = new Promise<void>((resolve) => setTimeout(resolve, ms));
  const pump = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        closed = true;
        return;
      }
      body += decoder.decode(value, { stream: true });
    }
  })();
  await Promise.race([pump, deadline]);
  return { body, closed };
}

function withRoute(run: (base: string) => Promise<void>) {
  return (async () => {
    const app = express();
    app.use(express.json());
    app.post("/api/kemma/stream", (req: Request, res: Response, next: NextFunction) => {
      (req as Request & { user?: unknown }).user = { id: 7, name: "Remy" };
      kemmaStreamRoute(req, res).catch(next);
    });
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      res.status(500).json({ error: String((err as Error)?.message ?? err) });
    });
    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    try {
      await run(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  })();
}

beforeEach(() => {
  vi.clearAllMocks();
  db.ensureChatSession.mockImplementation(async () => "owned" as const);
  quota.checkQuota.mockResolvedValue({ allowed: true, remaining: 5 });
  quota.getQuotaSummary.mockResolvedValue({ tier: "pro" });
  db.getChatSessionSettings.mockResolvedValue({});
  db.addChatMessage.mockResolvedValue(undefined);
  engine.kemmaExecute.mockImplementation(async (input: { onStream?: (c: string) => void }) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    input.onStream?.("Hello ");
    input.onStream?.("there.");
    return {
      response: "Hello there.",
      toolCalls: [],
      isAgentic: false,
      tokensUsed: { input: 5, output: 2, total: 7 },
      modelsUsed: ["qwen3.8-max (qwen)"],
      stepsUsed: 1,
      durationMs: 12,
      sources: [],
      isError: false,
    };
  });
});

describe("kemma stream over a real connection", () => {
  it("delivers every token plus usage and done, and ends the stream", async () => {
    await withRoute(async (base) => {
      const res = await fetch(`${base}/api/kemma/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      const stream = await readStream(res, 1500);
      expect(stream.closed, "the SSE response never ended: Chat.tsx keeps the spinner forever").toBe(true);
      const tokens = stream.body
        .split("\n\n")
        .filter((block) => block.startsWith("event: token"))
        .map((block) => JSON.parse(block.split("data: ")[1]) as string);
      expect(tokens.join("")).toBe("Hello there.");
      expect(stream.body).toContain("event: usage");
      expect(stream.body).toContain("event: done");
    });
  });

  it("surfaces an engine error as one error frame over a real connection", async () => {
    engine.kemmaExecute.mockImplementationOnce(async () => ({
      response: "All models failed. qwen3.8-max: API error 500",
      toolCalls: [],
      isAgentic: false,
      tokensUsed: { input: 0, output: 0, total: 0 },
      modelsUsed: [],
      stepsUsed: 0,
      durationMs: 1,
      sources: [],
      isError: true,
    }));
    await withRoute(async (base) => {
      const res = await fetch(`${base}/api/kemma/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      });
      const stream = await readStream(res, 1500);
      expect(stream.closed).toBe(true);
      expect(stream.body).toContain("event: error");
      expect(stream.body).not.toContain("event: done");
    });
  });

  it("creates the thread row before persisting, with a 60-char title from the first message", async () => {
    const long = "Plan the Q3 marketing budget ".repeat(10);
    await withRoute(async (base) => {
      const res = await fetch(`${base}/api/kemma/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "sess-new", messages: [{ role: "user", content: long }] }),
      });
      expect(res.status).toBe(200);
      await readStream(res, 1500);
    });
    expect(db.ensureChatSession).toHaveBeenCalledWith("sess-new", 7, long.trim().slice(0, 60));
    const order = [
      db.ensureChatSession.mock.invocationCallOrder[0],
      db.addChatMessage.mock.invocationCallOrder[0],
    ];
    expect(order[0]).toBeLessThan(order[1]); // row first, messages after
    expect(db.addChatMessage).toHaveBeenCalled();
  });

  it("refuses a sessionId owned by another user with 403 JSON, before any SSE frame", async () => {
    db.ensureChatSession.mockResolvedValueOnce("foreign" as never);
    await withRoute(async (base) => {
      const res = await fetch(`${base}/api/kemma/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "sess-other", messages: [{ role: "user", content: "hi" }] }),
      });
      expect(res.status).toBe(403);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(await res.json()).toMatchObject({ error: /another user/i });
    });
    expect(engine.kemmaExecute).not.toHaveBeenCalled();
    expect(db.addChatMessage).not.toHaveBeenCalled();
  });

  it("a client that really hangs up stops the writes without an unhandled fault", async () => {
    engine.kemmaExecute.mockImplementation(async (input: { onStream?: (c: string) => void }) => {
      for (let i = 0; i < 40; i++) {
        await new Promise((resolve) => setTimeout(resolve, 15));
        input.onStream?.(`chunk ${i} `);
      }
      return {
        response: "long answer",
        toolCalls: [],
        isAgentic: false,
        tokensUsed: { input: 1, output: 1, total: 2 },
        modelsUsed: ["m"],
        stepsUsed: 1,
        durationMs: 1,
        sources: [],
        isError: false,
      };
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (err: unknown) => unhandled.push(err);
    process.on("unhandledRejection", onUnhandled);
    try {
      await withRoute(async (base) => {
        const controller = new AbortController();
        const res = await fetch(`${base}/api/kemma/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: "sess-live", messages: [{ role: "user", content: "hi" }] }),
          signal: controller.signal,
        });
        const reader = res.body!.getReader();
        const first = await reader.read();
        expect(first.done).toBe(false);
        controller.abort();
        await new Promise((resolve) => setTimeout(resolve, 500));
      });
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
    expect(unhandled.map(String)).toEqual([]);
    // The disconnect must actually be noticed: writes stop and nothing more is persisted.
    const persisted = db.addChatMessage.mock.calls.map((c) => c[3]);
    expect(persisted).toContain("user");
    expect(persisted, "the route kept streaming after the client hung up").not.toContain("assistant");
  });
});
