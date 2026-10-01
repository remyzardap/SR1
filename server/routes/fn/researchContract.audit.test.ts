/**
 * Audit test (area 3): the reference-file contract between Chat.tsx's deep mode and
 * /api/fn/research.
 *
 * client/src/components/ai-elements/prompt-input.tsx converts every attached file from
 * its blob: URL to a data: URL before onSubmit() (handleSubmit, the blob conversion
 * block), and Chat.tsx forwards `file.url` unchanged. The function only accepts http
 * and https, so the composer's "Attach reference files" path - which is switched on
 * exactly in deep mode (allowAttachments={mode === "deep"}) - answers every request
 * with a 400 before the stream opens. These tests pin the current behaviour so the
 * mismatch is visible from the test suite; they are not an endorsement of it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const engine = vi.hoisted(() => ({ kemmaExecute: vi.fn() }));
const quota = vi.hoisted(() => ({ getQuotaSummary: vi.fn(), checkQuota: vi.fn() }));
const doc = vi.hoisted(() => ({ bytesToText: vi.fn() }));
const fetcher = vi.hoisted(() => ({ fetchCapped: vi.fn(), MAX_REFERENCE_FILES: 5 }));

vi.mock("../../kemma/engine", () => engine);
vi.mock("../../core/quotaCheck", () => quota);
vi.mock("../../lib/fnDocument", () => doc);
vi.mock("../../lib/fnFetch", () => fetcher);

import { MAX_RESEARCH_CHARS, handleResearch, readFiles, referenceContext } from "./research";
import { FnError } from "../../lib/fnErrors";

const request = (body: unknown) => ({ body, on: () => {} } as never);

const fakeRes = () => ({
  frames: [] as string[],
  writableEnded: false,
  setHeader() {},
  flushHeaders() {},
  write(chunk: string) {
    this.frames.push(chunk);
  },
  end() {
    this.writableEnded = true;
  },
  on() {},
});

const question = { messages: [{ role: "user", content: "what changed in nickel policy?" }] };

beforeEach(() => {
  vi.clearAllMocks();
  quota.checkQuota.mockResolvedValue({ allowed: true, remaining: 5 });
  quota.getQuotaSummary.mockResolvedValue({ tier: "pro" });
  engine.kemmaExecute.mockResolvedValue({
    response: "answer",
    toolCalls: [],
    isAgentic: true,
    tokensUsed: { input: 1, output: 1, total: 2 },
    modelsUsed: ["m"],
    stepsUsed: 1,
    durationMs: 1,
    sources: [],
  });
  fetcher.fetchCapped.mockResolvedValue({ buffer: Buffer.from("bytes"), contentType: "application/pdf", bytes: 5 });
  doc.bytesToText.mockResolvedValue("extracted text");
});

describe("the reference file shape the composer actually sends", () => {
  it("refuses a data: URL, which is what prompt-input hands over for every attachment", () => {
    const dataUrl = `data:application/pdf;base64,${Buffer.from("a small pdf").toString("base64")}`;
    expect(() => readFiles({ files: [{ filename: "brief.pdf", mediaType: "application/pdf", url: dataUrl }] })).toThrow(
      FnError
    );
    expect(() => readFiles({ files: [{ url: dataUrl }] })).toThrow("File references must be http or https URLs.");
  });

  it("and a blob: URL, the other shape the client can produce if the conversion fails", () => {
    expect(() => readFiles({ files: [{ url: "blob:http://localhost:5173/6f1c" }] })).toThrow("File references must be http or https URLs.");
  });

  it("so the whole deep-research request fails as a 400 before any frame is written", async () => {
    const res = fakeRes();
    const body = { ...question, files: [{ filename: "brief.pdf", mediaType: "application/pdf", url: "data:application/pdf;base64,QQ==" }] };
    await expect(handleResearch(7, request(body), res as never)).rejects.toMatchObject({ status: 400 });
    expect(res.frames).toHaveLength(0);
    expect(engine.kemmaExecute).not.toHaveBeenCalled();
  });

  it("reads a hosted http(s) reference fine, so only the inline shape is broken", async () => {
    const context = await referenceContext([{ filename: "brief.pdf", mediaType: "application/pdf", url: "https://files.example.com/b.pdf" }], 7, () => {});
    expect(context).toContain("File: brief.pdf");
    expect(fetcher.fetchCapped).toHaveBeenCalledWith("https://files.example.com/b.pdf");
  });
});

describe("size ceilings on the inline path the server would have to accept", () => {
  it("a 5 MB attachment is roughly 6.7 MB of base64 inside the 10 MB JSON body limit", () => {
    // ChatInput sets maxFileSize to 5 MB and maxFiles to 5: five of them are about
    // 33 MB of JSON, which the express.json limit rejects before this function runs.
    const one = Buffer.alloc(5 * 1024 * 1024).toString("base64");
    expect(one.length).toBeGreaterThan(6_700_000);
    expect(one.length * 5).toBeGreaterThan(10 * 1024 * 1024);
  });

  it("the text ceiling per file and per run are independent of the transport", async () => {
    doc.bytesToText.mockResolvedValue("x".repeat(MAX_RESEARCH_CHARS));
    const notices: string[] = [];
    const files = Array.from({ length: 5 }, (_unused, i) => ({ filename: `f${i}.pdf`, url: `https://files.example.com/f${i}` }));
    const context = await referenceContext(files, 7, (m) => notices.push(m));
    // 20k per file, 60k for the whole block: three files go in, the rest are named.
    expect((context.match(/File: f/g) ?? []).length).toBe(3);
    expect(context.split("File: ").length - 1).toBe(3);
    expect(notices).toEqual(["Skipped f3.pdf: the reference budget is full.", "Skipped f4.pdf: the reference budget is full."]);
  });
});
