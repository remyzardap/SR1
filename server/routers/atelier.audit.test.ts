import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Express } from "express";
import { exportRequestSchema, MAX_REPORT_BYTES } from "../lib/atelierExport";

// ─── Mocked seams ─────────────────────────────────────────────────────────────

const authState = vi.hoisted(() => ({ token: "fake-vertex-token" }));

vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getClient() {
      return { getAccessToken: async () => ({ token: authState.token }) };
    }
  },
}));

const s1 = vi.hoisted(() => ({
  blend: vi.fn(async (_text: string, messages: unknown[]) => ({
    config: { baseUrl: "https://qwen.test/v1", model: "qwen3.8-max", apiKey: "q" },
    messages,
  })),
}));

vi.mock("./s1Router", () => ({ s1Blend: s1.blend }));

const atelierExport = vi.hoisted(() => ({
  exportReport: null as null | ((...args: any[]) => Promise<any>),
}));

vi.mock("../lib/atelierExport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/atelierExport")>();
  return {
    ...actual,
    exportAtelierReport: async (...args: any[]) => {
      if (atelierExport.exportReport) return atelierExport.exportReport(...args);
      return actual.exportAtelierReport(...args);
    },
  };
});

import { registerAtelierRoutes } from "./atelier";

// ─── Fakes ────────────────────────────────────────────────────────────────────

type Registered = { path: string; handlers: Array<(req: any, res: any, next?: any) => any> };

function captureApp() {
  const routes: Registered[] = [];
  const app = {
    post(path: string, ...handlers: Array<(req: any, res: any, next?: any) => any>) {
      routes.push({ path, handlers });
    },
  } as unknown as Express;
  return { app, routes };
}

function fakeRes() {
  const frames: string[] = [];
  const out: { status: number | null; json: unknown; sent: unknown; ended: boolean; headers: Record<string, string> } = {
    status: null,
    json: null,
    sent: null,
    ended: false,
    headers: {},
  };
  const res = {
    setHeader(k: string, v: string) {
      out.headers[k] = String(v);
    },
    flushHeaders() {},
    write(chunk: string) {
      frames.push(chunk);
    },
    status(code: number) {
      out.status = code;
      return this;
    },
    json(payload: unknown) {
      out.json = payload;
      return this;
    },
    send(payload: unknown) {
      out.sent = payload;
      return this;
    },
    end() {
      out.ended = true;
    },
  };
  return { res, out, frames };
}

function parseFrames(frames: string[]) {
  // returns [{event, data}] from SSE text blocks
  const joined = frames.join("");
  const events: Array<{ event: string; data: string }> = [];
  for (const block of joined.split("\n\n")) {
    if (!block.trim()) continue;
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7);
      else if (line.startsWith("data: ")) data = line.slice(6);
    }
    if (data) events.push({ event, data });
  }
  return events;
}

const enc = new TextEncoder();

function llmStreamResponse(tokens: string[]) {
  const body = new ReadableStream({
    start(c) {
      for (const t of tokens) {
        c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`));
      }
      c.enqueue(enc.encode("data: [DONE]\n\n"));
      c.close();
    },
  });
  return new Response(body, { status: 200 });
}

function lastHandler(routes: Registered[], path: string) {
  const route = routes.find((r) => r.path === path)!;
  return route.handlers[route.handlers.length - 1];
}

const validReport = {
  title: "Test Report",
  theme: "corporate",
  sections: [{ id: "s1", type: "section", title: "A", content: "Body" }],
};

const realFetch = globalThis.fetch;

function stubLlmFetch(tokens: string[] = ["Hello "]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: unknown) => {
      if (String(url).includes("qwen.test") || String(url).includes("aiplatform") || String(url).includes("llm.test")) {
        return llmStreamResponse(tokens);
      }
      return (realFetch as any)(url, init);
    })
  );
}

beforeEach(() => {
  s1.blend.mockClear();
  atelierExport.exportReport = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Route surface vs the /api/atelier session mount ─────────────────────────

describe("atelier surface vs session mount (audit)", () => {
  it("registers ONLY /api/atelier/* paths, all of them under the mounted prefix", () => {
    const { app, routes } = captureApp();
    registerAtelierRoutes(app);
    expect(routes.map((r) => r.path).sort()).toEqual([
      "/api/atelier/export",
      "/api/atelier/generate",
      "/api/atelier/interview",
      "/api/atelier/parse",
    ]);
  });

  it("index.ts mounts requireSession on /api/atelier BEFORE registering the routes", () => {
    const src = readFileSync(resolve(__dirname, "../_core/index.ts"), "utf-8");
    const mount = src.search(/app\.use\(\s*["']\/api\/atelier["']\s*,\s*requireSession\s*\)/);
    const register = src.indexOf("registerAtelierRoutes(app)");
    expect(mount).toBeGreaterThanOrEqual(0);
    expect(register).toBeGreaterThan(mount);
  });

  it("no atelier endpoint is reachable anonymously when mounted like index.ts", async () => {
    const authenticate = vi.fn(async () => {
      throw new Error("no session");
    });
    const app = express();
    app.use(express.json());
    // Mirror of requireSession in server/_core/index.ts (it calls
    // sdk.authenticateRequest, mocked through this closure).
    const requireSession = async (req: Request, res: Response, next: NextFunction) => {
      try {
        (req as any).user = await authenticate(req);
        next();
      } catch {
        res.status(401).json({ error: "Unauthorized" });
      }
    };
    app.use("/api/atelier", requireSession);
    registerAtelierRoutes(app);
    const server = await new Promise<Server>((done) => {
      const s = app.listen(0, "127.0.0.1", () => done(s));
    });
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    try {
      const bodies: Array<[string, RequestInit]> = [
        ["/api/atelier/interview", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }],
        ["/api/atelier/generate", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }],
        ["/api/atelier/export", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }],
        ["/api/atelier/parse", { method: "POST", body: "not-multipart" }],
      ];
      for (const [path, init] of bodies) {
        const res = await fetch(`${base}${path}`, init);
        expect([path, res.status]).toEqual([path, 401]);
      }
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  });

  it("with a session the interview endpoint streams SSE", async () => {
    stubLlmFetch(["Hello "]);
    const app = express();
    app.use(express.json());
    const requireSession = (req: Request, _res: Response, next: NextFunction) => {
      (req as any).user = { id: 1 };
      next();
    };
    app.use("/api/atelier", requireSession);
    registerAtelierRoutes(app);
    const server = await new Promise<Server>((done) => {
      const s = app.listen(0, "127.0.0.1", () => done(s));
    });
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    try {
      const res = await fetch(`${base}/api/atelier/interview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      const text = await res.text();
      expect(text).toContain("event: token");
      expect(text).toContain("event: done");
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  });
});

// ─── Interview ───────────────────────────────────────────────────────────────

describe("atelier interview (audit)", () => {
  it("streams tokens, signals ready only when the tag appears, and reports userCount", async () => {
    const { app, routes } = captureApp();
    registerAtelierRoutes(app);
    vi.stubGlobal("fetch", vi.fn(async () => llmStreamResponse(["Great, ", "almost done "])));
    const { res, frames } = fakeRes();
    const handler = lastHandler(routes, "/api/atelier/interview");
    await handler(
      { body: { messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "c" }] } },
      res
    );
    const events = parseFrames(frames);
    expect(events.find((e) => e.event === "ready")).toBeUndefined();
    const tokenText = events.filter((e) => e.event === "token").map((e) => JSON.parse(e.data)).join("");
    expect(tokenText).toBe("Great, almost done ");
    expect(JSON.parse(events.find((e) => e.event === "done")!.data)).toEqual({ userCount: 2 });
  });

  it("emits the ready event when the model ends with [READY_TO_GENERATE]", async () => {
    const { app, routes } = captureApp();
    registerAtelierRoutes(app);
    vi.stubGlobal("fetch", vi.fn(async () => llmStreamResponse(["done talking", "\n[READY_TO_GENERATE]"])));
    const { res, frames } = fakeRes();
    await lastHandler(routes, "/api/atelier/interview")({ body: { messages: [] } }, res);
    const events = parseFrames(frames);
    expect(events.some((e) => e.event === "ready" && e.data === "true")).toBe(true);
  });

  it("uses a Vertex bearer when the blend config carries vertexProject", async () => {
    const { app, routes } = captureApp();
    registerAtelierRoutes(app);
    s1.blend.mockResolvedValueOnce({
      config: { baseUrl: "https://aiplatform.googleapis.com/v1/projects/p/locations/global/endpoints/openapi", model: "google/gemini-3.8-flash", apiKey: "", vertexProject: "p" },
      messages: [],
    } as never);
    const fetchMock = vi.fn(async () => llmStreamResponse(["ok"]));
    vi.stubGlobal("fetch", fetchMock);
    const { res } = fakeRes();
    await lastHandler(routes, "/api/atelier/interview")({ body: { messages: [] } }, res);
    const [, init] = (fetchMock as any).mock.calls.at(-1);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer fake-vertex-token");
  });

  it("sends an EMPTY bearer when the vertex token resolves to undefined (silent blank-auth request)", async () => {
    const { app, routes } = captureApp();
    registerAtelierRoutes(app);
    s1.blend.mockResolvedValueOnce({
      config: { baseUrl: "https://aiplatform.googleapis.com/x", model: "m", apiKey: "", vertexProject: "p" },
      messages: [],
    } as never);
    const prev = authState.token;
    authState.token = undefined as unknown as string;
    const fetchMock = vi.fn(async () => llmStreamResponse(["x"]));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { res } = fakeRes();
      await lastHandler(routes, "/api/atelier/interview")({ body: { messages: [] } }, res);
      const [, init] = (fetchMock as any).mock.calls.at(-1);
      // Documents the flaw class: the code falls back to an empty bearer and
      // still fires the request instead of failing with a clear error.
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ");
    } finally {
      authState.token = prev;
    }
  });

  it("converts a blend failure into an SSE error frame (headers already flushed)", async () => {
    const { app, routes } = captureApp();
    registerAtelierRoutes(app);
    s1.blend.mockRejectedValueOnce(new Error("No LLM provider configured"));
    const { res, frames } = fakeRes();
    await lastHandler(routes, "/api/atelier/interview")({ body: { messages: [] } }, res);
    const events = parseFrames(frames);
    expect(events.some((e) => e.event === "error" && e.data.includes("No LLM provider configured"))).toBe(true);
  });
});

// ─── Generate ────────────────────────────────────────────────────────────────

describe("atelier generate (audit)", () => {
  it("parses fenced JSON and emits the structured report", async () => {
    const { app, routes } = captureApp();
    registerAtelierRoutes(app);
    const reportJson = JSON.stringify({ ...validReport, sections: [...validReport.sections] });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => llmStreamResponse(["```json\n", reportJson, "\n```"]))
    );
    const { res, frames } = fakeRes();
    await lastHandler(routes, "/api/atelier/generate")({ body: { messages: [] } }, res);
    const events = parseFrames(frames);
    const report = events.find((e) => e.event === "report");
    expect(report).toBeTruthy();
    expect(JSON.parse(report!.data).title).toBe("Test Report");
  });

  it("emits an error event when the model output is not valid JSON", async () => {
    const { app, routes } = captureApp();
    registerAtelierRoutes(app);
    vi.stubGlobal("fetch", vi.fn(async () => llmStreamResponse(["An essay, not JSON"])));
    const { res, frames } = fakeRes();
    await lastHandler(routes, "/api/atelier/generate")({ body: { messages: [] } }, res);
    const events = parseFrames(frames);
    expect(events.some((e) => e.event === "error" && e.data.includes("Failed to parse report structure"))).toBe(true);
  });

  it("injects uploaded file content as a final user message", async () => {
    const { app, routes } = captureApp();
    registerAtelierRoutes(app);
    vi.stubGlobal("fetch", vi.fn(async () => llmStreamResponse(['{"title":"t","sections":[{"content":"x"}]}'])));
    const { res } = fakeRes();
    await lastHandler(routes, "/api/atelier/generate")(
      { body: { messages: [], uploadedContent: "DOC TEXT", mode: "reformat", reportType: "Proposal" } },
      res
    );
    const callMessages = s1.blend.mock.calls[0][1] as Array<{ role: string; content: string }>;
    expect(callMessages.at(-1)!.content).toContain("DOC TEXT");
    expect(callMessages.at(-1)!.content).toContain("reformat and restructure");
  });

  it("CONTRACT GAP: emits any JSON.parse result as report, even shapes /api/atelier/export then rejects", async () => {
    const { app, routes } = captureApp();
    registerAtelierRoutes(app);
    // A plausible LLM output the preview renders fine: 120 sections,
    // one over the 30k body cap, and an object cell in a table row.
    const bigReport = {
      title: "Very Long",
      sections: [
        ...Array.from({ length: 119 }, (_, i) => ({ id: `s${i}`, type: "section", content: "Body" })),
        { id: "big", type: "section", content: "x".repeat(31_000) },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => llmStreamResponse([JSON.stringify(bigReport)])));
    const { res, frames } = fakeRes();
    await lastHandler(routes, "/api/atelier/generate")({ body: { messages: [] } }, res);
    const events = parseFrames(frames);
    expect(events.some((e) => e.event === "report")).toBe(true);

    // The exact same object now fails the export contract: the client has a
    // preview it cannot export. Export answers a generic 400.
    const { res: exportRes, out: exportOut } = fakeRes();
    await lastHandler(routes, "/api/atelier/export")({ body: { report: bigReport, format: "pdf" } }, exportRes);
    expect(exportOut.status).toBe(400);
    expect(exportOut.json).toEqual({ error: "Invalid export request" });
    // And the route does not say WHICH part is invalid, nor does generate warn.
    expect(exportRequestSchema.safeParse({ report: bigReport, format: "pdf" }).success).toBe(false);
  });
});

// ─── Export ──────────────────────────────────────────────────────────────────

describe("atelier export (audit)", () => {
  it("rejects oversized reports with 413 before validation", async () => {
    const { app, routes } = captureApp();
    registerAtelierRoutes(app);
    const huge = { title: "Big", sections: [{ id: "s", content: "x".repeat(MAX_REPORT_BYTES + 10) }] };
    const { res, out } = fakeRes();
    await lastHandler(routes, "/api/atelier/export")({ body: { report: huge, format: "md" } }, res);
    expect(out.status).toBe(413);
    expect(out.json).toEqual({ error: "Report too large" });
  });

  it("rejects unknown formats with 400", async () => {
    const { app, routes } = captureApp();
    registerAtelierRoutes(app);
    const { res, out } = fakeRes();
    await lastHandler(routes, "/api/atelier/export")({ body: { report: validReport, format: "pptx" } }, res);
    expect(out.status).toBe(400);
  });

  it("streams the file bytes with X-Filename and the format mime", async () => {
    const { app, routes } = captureApp();
    registerAtelierRoutes(app);
    atelierExport.exportReport = async () => ({
      file: { buffer: Buffer.from("# hi"), mimeType: "text/markdown", extension: "md" },
      filename: "test-report.md",
    });
    const { res, out } = fakeRes();
    await lastHandler(routes, "/api/atelier/export")({ body: { report: validReport, format: "md" } }, res);
    expect(out.status).toBeNull();
    expect(out.headers["Content-Type"]).toBe("text/markdown");
    expect(out.headers["X-Filename"]).toBe("test-report.md");
    expect(String(out.headers["Content-Disposition"])).toContain('attachment; filename="test-report.md"');
    expect(Buffer.isBuffer(out.sent)).toBe(true);
  });

  it("uses the request theme when present, else report.theme", async () => {
    const { app, routes } = captureApp();
    registerAtelierRoutes(app);
    const seen: Array<string | null | undefined> = [];
    atelierExport.exportReport = async (_r: unknown, _f: string, theme?: string | null) => {
      seen.push(theme);
      return { file: { buffer: Buffer.from("x"), mimeType: "text/markdown", extension: "md" }, filename: "x.md" };
    };
    const handler = lastHandler(routes, "/api/atelier/export");
    let { res, out } = fakeRes();
    await handler({ body: { report: validReport, format: "md", theme: "monochrome" } }, res);
    ({ res, out } = fakeRes());
    await handler({ body: { report: validReport, format: "md" } }, res);
    expect(seen).toEqual(["monochrome", "corporate"]);
  });

  it("returns 500 with a generic message when file generation fails", async () => {
    const { app, routes } = captureApp();
    registerAtelierRoutes(app);
    atelierExport.exportReport = async () => {
      throw new Error("pdfkit exploded");
    };
    const { res, out } = fakeRes();
    await lastHandler(routes, "/api/atelier/export")({ body: { report: validReport, format: "pdf" } }, res);
    expect(out.status).toBe(500);
    expect(out.json).toEqual({ error: "Export failed" });
  });
});

// ─── Parse ───────────────────────────────────────────────────────────────────

describe("atelier parse (audit)", () => {
  it("400s when no file was uploaded", async () => {
    const { app, routes } = captureApp();
    registerAtelierRoutes(app);
    const { res, out } = fakeRes();
    await lastHandler(routes, "/api/atelier/parse")({ file: undefined }, res);
    expect(out.status).toBe(400);
  });

  it("returns the text content with content capped at 50k chars and preview at 500", async () => {
    const { app, routes } = captureApp();
    registerAtelierRoutes(app);
    const text = "héllo".repeat(20_000); // 100k chars
    const { res, out } = fakeRes();
    await lastHandler(routes, "/api/atelier/parse")(
      { file: { buffer: Buffer.from(text, "utf-8"), mimetype: "text/plain", originalname: "notes.txt", size: text.length } },
      res
    );
    const body = out.json as { filename: string; size: number; content: string; preview: string };
    expect(body.filename).toBe("notes.txt");
    expect(body.content).toHaveLength(50_000);
    expect(body.preview).toHaveLength(500);
    expect(body.content.startsWith("héllo")).toBe(true);
  });

  it("falls back to the manual-help text when a PDF yields less than 100 chars", async () => {
    const { app, routes } = captureApp();
    registerAtelierRoutes(app);
    const { res, out } = fakeRes();
    await lastHandler(routes, "/api/atelier/parse")(
      { file: { buffer: Buffer.from("%PDF-1.4 binary junk", "latin1"), mimetype: "application/pdf", originalname: "deck.pdf", size: 19 } },
      res
    );
    const body = out.json as { content: string };
    expect(body.content).toContain("could not be extracted automatically");
  });

  it("silently returns EMPTY content for unsupported types (accepted as success)", async () => {
    const { app, routes } = captureApp();
    registerAtelierRoutes(app);
    const { res, out } = fakeRes();
    await lastHandler(routes, "/api/atelier/parse")(
      { file: { buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), mimetype: "image/png", originalname: "chart.png", size: 4 } },
      res
    );
    expect(out.status).toBeNull(); // no error status: HTTP 200
    const body = out.json as { content: string; preview: string };
    expect(body.content).toBe("");
    expect(body.preview).toBe("");
    // The Atelier page then reports "parsed successfully" and generate injects
    // an empty document - silent data loss for png/zip/rtf/etc.
  });
});
