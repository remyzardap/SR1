import { describe, it, expect, vi, beforeEach } from "vitest";

const engine = vi.hoisted(() => ({ kemmaExecute: vi.fn() }));
const quota = vi.hoisted(() => ({ getQuotaSummary: vi.fn(), checkQuota: vi.fn() }));
const doc = vi.hoisted(() => ({ bytesToText: vi.fn() }));
const fetcher = vi.hoisted(() => ({ fetchCapped: vi.fn(), MAX_REFERENCE_FILES: 5 }));
const llm = vi.hoisted(() => ({ stream: vi.fn(), LlmUnavailableError: class LlmUnavailableError extends Error {} }));

vi.mock("../../kemma/engine", () => engine);
vi.mock("../../core/quotaCheck", () => quota);
vi.mock("../../lib/fnDocument", () => doc);
vi.mock("../../lib/fnFetch", () => fetcher);
vi.mock("../../lib/fnLlm", () => llm);

import {
  MAX_FILE_TEXT_CHARS,
  MAX_RESEARCH_CHARS,
  MAX_RESEARCH_MESSAGES,
  handleResearch,
  readFiles,
  readMessages,
  referenceContext,
  withReferenceContext,
} from "./research";
import { FnError } from "../../lib/fnErrors";

function fakeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    frames: [] as string[],
    headers: {} as Record<string, string>,
    ended: false,
    writableEnded: false,
    headersSent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    flushHeaders() {
      this.headersSent = true;
    },
    write(chunk: string) {
      this.frames.push(chunk);
    },
    end() {
      this.ended = true;
      this.writableEnded = true;
    },
    on() {},
  };
  return res;
}

const request = (body: unknown) => ({ body, on: () => {} } as never);

/** The parser from client/src/pages/Chat.tsx parseSseChunk. */
function parseSse(raw: string): Array<{ event: string; data: string }> {
  const events: Array<{ event: string; data: string }> = [];
  for (const block of raw.split("\n\n")) {
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7).trim();
      else if (line.startsWith("data: ")) data = line.slice(6);
    }
    if (data) events.push({ event, data });
  }
  return events;
}

const engineOutput = {
  response: "Research answer with [1] citation.",
  toolCalls: [],
  isAgentic: true,
  tokensUsed: { input: 100, output: 50, total: 150 },
  modelsUsed: ["qwen3.8-max (qwen)"],
  stepsUsed: 3,
  durationMs: 1000,
  sources: [{ id: 1, url: "https://example.com/a", title: "Source A" }],
};

const question = { messages: [{ role: "user", content: "What changed in nickel policy this month?" }] };

beforeEach(() => {
  vi.clearAllMocks();
  quota.checkQuota.mockResolvedValue({ allowed: true, remaining: 5 });
  quota.getQuotaSummary.mockResolvedValue({ tier: "pro" });
  engine.kemmaExecute.mockResolvedValue(engineOutput);
  fetcher.fetchCapped.mockResolvedValue({ buffer: Buffer.from("file bytes"), contentType: "application/pdf", bytes: 10 });
  doc.bytesToText.mockResolvedValue("extracted file text");
});

describe("research request contract", () => {
  it("accepts the messages shape Chat.tsx sends", () => {
    const messages = readMessages({
      messages: [
        { role: "user", content: "first" },
        { role: "assistant", content: "second" },
        { role: "user", content: "third" },
      ],
    });
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  it("refuses an empty, oversized or malformed conversation", () => {
    expect(() => readMessages({})).toThrow("messages required");
    expect(() => readMessages({ messages: [] })).toThrow("messages required");
    expect(() => readMessages({ messages: [{ role: "user" }] })).toThrow("A message has no text.");
    expect(() => readMessages({ messages: [{ role: "wizard", content: "x" }] })).toThrow("A message role is not valid.");
    expect(() => readMessages({ messages: [{ role: "assistant", content: "only an answer" }] })).toThrow("Ask a question to research.");

    const tooMany = Array.from({ length: MAX_RESEARCH_MESSAGES + 1 }, () => ({ role: "user", content: "hi" }));
    expect(() => readMessages({ messages: tooMany })).toThrow("This conversation is too long to research.");

    const tooLong = Array.from({ length: 20 }, () => ({ role: "user", content: "x".repeat(MAX_RESEARCH_CHARS) }));
    expect(() => readMessages({ messages: tooLong })).toThrow("This conversation is too long to research.");
  });

  it("validates the file list without fetching anything", () => {
    expect(readFiles({})).toEqual([]);
    expect(readFiles({ files: [] })).toEqual([]);
    expect(
      readFiles({ files: [{ filename: " Report.pdf ", mediaType: "application/pdf", url: "https://files.example.com/r.pdf" }] })
    ).toEqual([{ filename: "Report.pdf", mediaType: "application/pdf", url: "https://files.example.com/r.pdf" }]);

    expect(() => readFiles({ files: "nope" })).toThrow("files is not valid.");
    expect(() => readFiles({ files: [{ url: "ftp://files.example.com/r" }] })).toThrow("File references must be http or https URLs.");
    expect(() => readFiles({ files: [{ filename: "a.pdf" }] })).toThrow("A file reference is not a valid URL.");
    expect(() => readFiles({ files: [{ url: 42 }] })).toThrow("A file reference is not a valid URL.");
    expect(() => readFiles({ files: ["x"] })).toThrow("A file reference is not valid.");
    expect(() => readFiles({ files: Array.from({ length: 6 }, () => ({ url: "https://a.example/f", filename: "f" })) })).toThrow(
      "Up to 5 files can be researched at once."
    );
  });
});

describe("reference file context", () => {
  it("reads each file and labels it for the model", async () => {
    const notices: string[] = [];
    const context = await referenceContext([{ filename: "a.pdf", mediaType: "application/pdf", url: "https://files.example.com/a.pdf" }], 7, (m) =>
      notices.push(m)
    );
    expect(context).toContain("File: a.pdf");
    expect(context).toContain("extracted file text");
    expect(notices).toEqual([]);
    expect(doc.bytesToText).toHaveBeenCalledWith({ filename: "a.pdf", mediaType: "application/pdf" }, expect.any(Buffer), 7);
  });

  it("notices and skips a file it cannot read, then keeps researching", async () => {
    const notices: string[] = [];
    fetcher.fetchCapped.mockRejectedValueOnce(new FnError(400, "That file reference is not allowed."));
    const context = await referenceContext([{ filename: "private.pdf", url: "http://169.254.169.254/x" }], 7, (m) => notices.push(m));
    expect(context).toBe("");
    expect(notices).toEqual(["Skipped private.pdf: That file reference is not allowed."]);
  });

  it("caps each file and the whole reference block", async () => {
    doc.bytesToText.mockResolvedValue("x".repeat(50000));
    const notices: string[] = [];
    const files = [
      { filename: "big1.pdf", url: "https://a.example/1" },
      { filename: "big2.pdf", url: "https://a.example/2" },
      { filename: "big3.pdf", url: "https://a.example/3" },
      { filename: "big4.pdf", url: "https://a.example/4" },
    ];
    const context = await referenceContext(files, 7, (m) => notices.push(m));
    expect(context.split("File: ").length - 1).toBe(3);
    expect(context.length).toBeLessThan(MAX_FILE_TEXT_CHARS * 4 + 2000);
    expect(notices).toEqual(["Skipped big4.pdf: the reference budget is full."]);
  });

  it("attaches the block to the last user message only", () => {
    const out = withReferenceContext(
      [
        { role: "user", content: "ask" },
        { role: "assistant", content: "answer" },
        { role: "user", content: "follow up" },
      ],
      "REFS"
    );
    expect(out[2].content).toBe("follow up\n\nREFS");
    expect(out[0].content).toBe("ask");
  });
});

describe("research stream", () => {
  it("emits the events Chat.tsx reads, in the order it reads them", async () => {
    const res = fakeRes();
    engine.kemmaExecute.mockImplementationOnce(async (input: { onStream?: (c: string) => void; onToolStart?: (t: string, i: unknown) => void; onStepStart?: (s: number, m: string) => void }) => {
      input.onStepStart?.(1, "qwen3.8-max (qwen)");
      input.onToolStart?.("web_search", { query: "nickel" });
      input.onStream?.("Research answer ");
      input.onStream?.("with [1] citation.");
      return engineOutput;
    });

    await handleResearch(7, request(question), res as never);
    const events = parseSse(res.frames.join("")).map((e) => e.event);

    expect(events).toContain("model");
    expect(events).toContain("tool_start");
    expect(events).toContain("agent");
    expect(events.filter((e) => e === "token")).toHaveLength(2);
    expect(events).toEqual(["model", "tool_start", "agent", "token", "token", "sources", "usage", "done"]);

    const parsed = parseSse(res.frames.join(""));
    expect(JSON.parse(parsed.find((e) => e.event === "model")!.data)).toEqual({ step: 1, label: "qwen3.8-max (qwen)" });
    expect(JSON.parse(parsed.find((e) => e.event === "token")!.data)).toBe("Research answer ");
    expect(JSON.parse(parsed.find((e) => e.event === "sources")!.data)).toEqual(engineOutput.sources);
    expect(JSON.parse(parsed.find((e) => e.event === "usage")!.data)).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    expect(JSON.parse(parsed.find((e) => e.event === "done")!.data)).toBe("qwen3.8-max (qwen)");
  });

  it("runs the deep research pipeline with the research tools and the configured budget", async () => {
    await handleResearch(7, request(question), fakeRes() as never);
    expect(engine.kemmaExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        tier: "pro",
        isThinking: false,
        allowedTools: ["web_search", "browse", "run_code"],
        toolBudget: 60,
      })
    );
  });

  it("streams the finished report in pieces when the engine fans out to sub-agents", async () => {
    process.env.KEMMA_MAX_SUBAGENTS = "3";
    engine.kemmaExecute.mockImplementationOnce(async (input: { onStream?: unknown }) => {
      expect(input.onStream).toBeUndefined();
      return { ...engineOutput, response: "y".repeat(2000) };
    });

    const res = fakeRes();
    await handleResearch(7, request(question), res as never);
    const tokens = parseSse(res.frames.join("")).filter((e) => e.event === "token");
    expect(tokens).toHaveLength(3);
    expect(tokens.map((t) => (JSON.parse(t.data) as string).length).reduce((a, b) => a + b, 0)).toBe(2000);
    delete process.env.KEMMA_MAX_SUBAGENTS;
  });

  it("passes reference file text into the engine prompt", async () => {
    await handleResearch(7, request({ ...question, files: [{ filename: "a.pdf", url: "https://files.example.com/a.pdf" }] }), fakeRes() as never);
    const messages = engine.kemmaExecute.mock.calls[0][0].messages as Array<{ content: string }>;
    expect(messages[0].content).toContain("What changed in nickel policy this month?");
    expect(messages[0].content).toContain("File: a.pdf");
    expect(messages[0].content).toContain("extracted file text");
  });

  it("answers the quota rejection as JSON before the stream starts", async () => {
    quota.checkQuota.mockResolvedValueOnce({ allowed: false, reason: "Daily message limit reached (20/day on free)" });
    const res = fakeRes();
    await handleResearch(7, request(question), res as never);
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: "Daily message limit reached (20/day on free)" });
    expect(engine.kemmaExecute).not.toHaveBeenCalled();
  });

  it("turns an engine fault into an error event the client can show", async () => {
    engine.kemmaExecute.mockRejectedValueOnce(new Error("All models failed. qwen: 503"));
    const res = fakeRes();
    await handleResearch(7, request(question), res as never);
    const error = parseSse(res.frames.join("")).find((e) => e.event === "error");
    expect(JSON.parse(error!.data)).toBe("Deep research could not be completed. Please try again.");
    expect(res.frames.join("")).not.toContain("All models failed");
  });

  it("answers an engine refusal with an error frame, not with tokens", async () => {
    engine.kemmaExecute.mockResolvedValueOnce({
      response: "Monthly spend cap for qwen reached ($40.00 / $40). Set KEMMA_CAP_QWEN to raise it.",
      toolCalls: [],
      isAgentic: false,
      tokensUsed: { input: 0, output: 0, total: 0 },
      modelsUsed: [],
      stepsUsed: 0,
      durationMs: 5,
      sources: [],
    });
    const res = fakeRes();
    await handleResearch(7, request(question), res as never);

    const events = parseSse(res.frames.join(""));
    expect(events).toEqual([{ event: "error", data: JSON.stringify("Deep research could not be completed. Please try again.") }]);
    expect(res.frames.join("")).not.toContain("KEMMA_CAP_QWEN");
  });

  it("refuses a malformed body before touching the quota or the engine", async () => {
    const res = fakeRes();
    await expect(handleResearch(7, request({ messages: "nope" }), res as never)).rejects.toThrow("messages required");
    expect(quota.checkQuota).not.toHaveBeenCalled();
    expect(engine.kemmaExecute).not.toHaveBeenCalled();
  });
});
