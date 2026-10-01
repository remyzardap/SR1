/**
 * Audit test (area 3): the three streaming /api/fn functions against a real Express
 * server and a real client, instead of a fake req/res pair.
 *
 * Why this exists: research, document-brief and chat-insights mark the stream
 * "aborted" from `req.on("close")`. On Node 20 an IncomingMessage is auto-destroyed
 * once its readable side ends, so a JSON request that express.json() has already
 * consumed fires "close" a few ms into the handler while the response is still open.
 * Gating writes and the final `res.end()` on that flag leaves the client with an
 * empty stream that never finishes: a permanent spinner in Chat.tsx, BriefDialog.tsx
 * and ChatInsightsDialog.tsx. Fake `req` objects with an inert `on()` cannot see it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import type { Server } from "node:http";

const engine = vi.hoisted(() => ({ kemmaExecute: vi.fn() }));
const quota = vi.hoisted(() => ({ getQuotaSummary: vi.fn(), checkQuota: vi.fn() }));
const doc = vi.hoisted(() => ({ bytesToText: vi.fn(), documentText: vi.fn() }));
const fetcher = vi.hoisted(() => ({ fetchCapped: vi.fn(), MAX_REFERENCE_FILES: 5 }));
const llm = vi.hoisted(() => ({
  stream: vi.fn(),
  LlmUnavailableError: class LlmUnavailableError extends Error {},
}));

vi.mock("../../kemma/engine", () => engine);
vi.mock("../../core/quotaCheck", () => quota);
vi.mock("../../lib/fnDocument", () => doc);
vi.mock("../../lib/fnFetch", () => fetcher);
vi.mock("../../lib/fnLlm", () => ({ stream: llm.stream, LlmUnavailableError: llm.LlmUnavailableError }));

import { handleResearch } from "./research";
import { handleDocumentBrief } from "./documentBrief";
import { handleChatInsights } from "./chatInsights";

/** The frames the client ends up seeing, plus whether the stream ever finished. */
interface ClientStream {
  body: string;
  closed: boolean;
}

async function readStream(res: Response, ms: number): Promise<ClientStream> {
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

function withHandler(handler: (userId: number, req: Request, res: Response) => Promise<void>, run: (base: string) => Promise<void>) {
  return (async () => {
    const app = express();
    app.use(express.json());
    app.post("/api/fn/:name", (req: Request, res: Response, next: NextFunction) => {
      (req as Request & { user?: unknown }).user = { id: 7 };
      handler(7, req, res).catch(next);
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

const post = (base: string, name: string, body: unknown) =>
  fetch(`${base}/api/fn/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/** The engine only ever answers after at least one tick, like a real provider call. */
async function later(fn: () => void) {
  await new Promise((resolve) => setTimeout(resolve, 10));
  fn();
}

beforeEach(() => {
  vi.clearAllMocks();
  quota.checkQuota.mockResolvedValue({ allowed: true, remaining: 5 });
  quota.getQuotaSummary.mockResolvedValue({ tier: "pro" });
  doc.bytesToText.mockResolvedValue("extracted file text");
  doc.documentText.mockResolvedValue({ text: "Quarterly report. Revenue 12.4B.", chars: 34 });

  engine.kemmaExecute.mockImplementation(async (input: { onStream?: (c: string) => void }) => {
    await later(() => {
      input.onStream?.("Nickel exports ");
      input.onStream?.("rose in 2026.");
    });
    return {
      response: "Nickel exports rose in 2026.",
      toolCalls: [],
      isAgentic: true,
      tokensUsed: { input: 10, output: 5, total: 15 },
      modelsUsed: ["qwen3.8-max (qwen)"],
      stepsUsed: 2,
      durationMs: 20,
      sources: [{ id: 1, url: "https://example.com/a", title: "Source A" }],
    };
  });

  llm.stream.mockImplementation(async (_messages: unknown, _options: unknown, onToken: (t: string) => void) => {
    await later(() => {
      onToken("## Overview\n");
      onToken("A quarterly report.");
    });
    return { text: "## Overview\nA quarterly report.", model: "chat-model", provider: "qwen" as const };
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("deep research over a real connection", () => {
  it("delivers every token, the done frame, and ends the stream", async () => {
    await withHandler(handleResearch, async (base) => {
      const res = await post(base, "research", { messages: [{ role: "user", content: "nickel policy?" }] });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      const stream = await readStream(res, 1500);
      expect(stream.closed, "the SSE response never ended: Chat.tsx keeps the spinner forever").toBe(true);
      expect(stream.body).toContain("event: token");
      expect(stream.body).toContain("event: sources");
      expect(stream.body).toContain("event: usage");
      expect(stream.body).toContain("event: done");
      // The exact bytes Chat.tsx parses: every token frame has to decode to text.
      const tokens = stream.body
        .split("\n\n")
        .filter((block) => block.startsWith("event: token"))
        .map((block) => JSON.parse(block.split("data: ")[1]) as string);
      expect(tokens.join("")).toBe("Nickel exports rose in 2026.");
    });
  });
});

describe("document-brief over a real connection", () => {
  it("delivers the brief and ends the stream", async () => {
    await withHandler(handleDocumentBrief, async (base) => {
      const res = await post(base, "document-brief", { filename: "notes.md", text: "hello" });
      expect(res.status).toBe(200);
      const stream = await readStream(res, 1500);
      expect(stream.closed, "the SSE response never ended: BriefDialog stays in 'working'").toBe(true);
      const tokens = stream.body
        .split("\n\n")
        .filter((block) => block.startsWith("event: token"))
        .map((block) => JSON.parse(block.split("data: ")[1]) as string);
      expect(tokens.join("")).toBe("## Overview\nA quarterly report.");
      expect(stream.body).toContain("event: done");
    });
  });
});

describe("chat-insights over a real connection", () => {
  it("delivers the analysis and ends the stream", async () => {
    await withHandler(handleChatInsights, async (base) => {
      const res = await post(base, "chat-insights", {
        conversation: "we decided to ship on Tuesday after the audit",
        focus: "decisions",
      });
      expect(res.status).toBe(200);
      const stream = await readStream(res, 1500);
      expect(stream.closed, "the SSE response never ended: the dialog never leaves 'loading'").toBe(true);
      expect(stream.body).toContain("event: token");
      expect(stream.body).toContain("event: done");
    });
  });
});

describe("a client that really does hang up mid-stream", () => {
  it("research settles without an unhandled fault after the reader goes away", async () => {
    engine.kemmaExecute.mockImplementation(async (input: { onStream?: (c: string) => void }) => {
      for (let i = 0; i < 40; i++) {
        await new Promise((resolve) => setTimeout(resolve, 15));
        input.onStream?.(`chunk ${i} `);
      }
      return {
        response: "long answer",
        toolCalls: [],
        isAgentic: true,
        tokensUsed: { input: 1, output: 1, total: 2 },
        modelsUsed: ["m"],
        stepsUsed: 1,
        durationMs: 1,
        sources: [],
      };
    });

    const unhandled: unknown[] = [];
    const onUnhandled = (err: unknown) => unhandled.push(err);
    process.on("unhandledRejection", onUnhandled);
    try {
      await withHandler(handleResearch, async (base) => {
        const controller = new AbortController();
        const pending = post(base, "research", { messages: [{ role: "user", content: "nickel policy?" }] }).then(async (res) => {
          const reader = res.body!.getReader();
          const first = await reader.read();
          expect(first.done).toBe(false);
          controller.abort(); // the Stop button in Chat.tsx
          await new Promise((resolve) => setTimeout(resolve, 400));
        });
        await pending.catch(() => {});
      });
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
    expect(unhandled.map(String)).toEqual([]);
  });

  it("a provider fault still reaches the client as one error frame, then a closed stream", async () => {
    engine.kemmaExecute.mockRejectedValueOnce(new Error("qwen: 503 upstream"));
    await withHandler(handleResearch, async (base) => {
      const res = await post(base, "research", { messages: [{ role: "user", content: "nickel?" }] });
      const stream = await readStream(res, 1500);
      expect(stream.closed).toBe(true);
      expect(stream.body).toContain("event: error");
      expect(stream.body).not.toContain("503");
      expect(stream.body).not.toContain("qwen");
    });
  });
});
