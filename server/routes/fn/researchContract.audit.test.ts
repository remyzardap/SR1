/**
 * Audit test (area 3): the reference-file contract between Chat.tsx's deep mode and
 * /api/fn/research.
 *
 * client/src/components/ai-elements/prompt-input.tsx converts every attached file from
 * its blob: URL to a data: URL before onSubmit(), and Chat.tsx forwards `file.url`.
 * The function used to answer only http and https, so the composer's "Attach reference
 * files" path failed every request with a 400 before the stream opened. That is fixed:
 * a data: URL is now read from the body, while hosted references still go through the
 * SSRF guard and anything else (blob:, ftp:) is still refused.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const engine = vi.hoisted(() => ({ kemmaExecute: vi.fn(), kemmaDocumentScan: vi.fn() }));
const quota = vi.hoisted(() => ({ getQuotaSummary: vi.fn(), checkQuota: vi.fn() }));
const doc = vi.hoisted(() => ({ bytesToText: vi.fn() }));
const fetcher = vi.hoisted(() => ({ fetchCapped: vi.fn() }));
const google = vi.hoisted(() => ({
  getConnectionStatus: vi.fn(),
  getDriveFileMeta: vi.fn(),
  downloadDriveFile: vi.fn(),
  exportDriveFile: vi.fn(),
  listDriveAttachments: vi.fn(),
}));

vi.mock("../../kemma/engine", () => engine);
vi.mock("../../core/quotaCheck", () => quota);
vi.mock("../../services/google", () => google);
// splitDataUrl stays the real decoder; only the extraction is faked.
vi.mock("../../lib/fnDocument", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/fnDocument")>()),
  bytesToText: doc.bytesToText,
}));
// Fake hostname answers for the SSRF guard: the guard itself stays the real code.
const dnsState = vi.hoisted(() => ({ addresses: [{ address: "93.184.216.34" }] }));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => dnsState.addresses) }));
/**
 * The transfer is faked but the address rule is not: `fetchCapped` runs the real
 * guard, so a metadata target is refused here exactly as it is in production.
 */
vi.mock("../../lib/fnFetch", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/fnFetch")>();
  return {
    MAX_REFERENCE_FILES: real.MAX_REFERENCE_FILES,
    fetchCapped: fetcher.fetchCapped.mockImplementation(async (url: string) => {
      await real.assertPublicUrl(url);
      return { buffer: Buffer.from("hosted bytes"), contentType: "application/pdf", bytes: 6 };
    }),
  };
});

import { MAX_RESEARCH_CHARS, handleResearch, readFiles, referenceContext } from "./research";
import { FnError } from "../../lib/fnErrors";

const request = (body: unknown) => ({ body, on: () => {} } as never);

const fakeRes = () => ({
  frames: [] as string[],
  writableEnded: false,
  headersSent: false,
  setHeader() {},
  flushHeaders() {
    this.headersSent = true;
  },
  status(code: number) {
    this.statusCode = code;
    return this;
  },
  statusCode: 200,
  body: null as unknown,
  json(payload: unknown) {
    this.body = payload;
  },
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
  doc.bytesToText.mockResolvedValue("extracted text");
  google.getConnectionStatus.mockResolvedValue({ connected: true, email: "user@example.test" });
});

describe("the reference file shape the composer actually sends", () => {
  it("accepts a data: URL instead of answering 400", () => {
    const dataUrl = `data:application/pdf;base64,${Buffer.from("a small pdf").toString("base64")}`;
    expect(readFiles({ files: [{ filename: "brief.pdf", mediaType: "application/pdf", url: dataUrl }] })).toEqual([
      { filename: "brief.pdf", mediaType: "application/pdf", url: dataUrl },
    ]);
  });

  it("still refuses a blob: URL, which carries nothing the server can read", () => {
    expect(() => readFiles({ files: [{ url: "blob:http://localhost:5173/6f1c" }] })).toThrow("File references must be http or https URLs.");
    expect(() => readFiles({ files: [{ url: "ftp://files.example.com/r" }] })).toThrow("File references must be http or https URLs.");
  });

  it("reads the inline file from the body, without any fetch, and passes its text on", async () => {
    const res = fakeRes();
    const body = { ...question, files: [{ filename: "brief.pdf", mediaType: "application/pdf", url: "data:application/pdf;base64,QQ==" }] };
    await handleResearch(7, request(body), res as never);

    expect(fetcher.fetchCapped).not.toHaveBeenCalled();
    const messages = engine.kemmaExecute.mock.calls[0][0].messages as Array<{ content: string }>;
    expect(messages[0].content).toContain("File: brief.pdf");
    expect(messages[0].content).toContain("extracted text");
    expect(res.frames.join("")).toContain("event: token");
  });

  it("refuses a private-address http reference and keeps researching on the question", async () => {
    const res = fakeRes();
    const body = { ...question, files: [{ filename: "meta.pdf", url: "http://169.254.169.254/latest/meta-data" }] };
    await handleResearch(7, request(body), res as never);

    const frames = res.frames.join("");
    expect(frames).toContain("Skipped meta.pdf: That file reference is not allowed.");
    expect(frames).toContain("event: token");
    expect(engine.kemmaExecute).toHaveBeenCalled();
    const messages = engine.kemmaExecute.mock.calls[0][0].messages as Array<{ content: string }>;
    expect(messages[0].content).not.toContain("meta.pdf");
  });

  it("reads a hosted http(s) reference through the guarded fetcher", async () => {
    const context = await referenceContext([{ filename: "brief.pdf", mediaType: "application/pdf", url: "https://files.example.com/b.pdf" }], 7, () => {});
    expect(context).toContain("File: brief.pdf");
    expect(fetcher.fetchCapped).toHaveBeenCalledWith("https://files.example.com/b.pdf");
  });
});

describe("size ceilings on the inline path", () => {
  it("a 5 MB attachment is roughly 6.7 MB of base64 inside the 10 MB JSON body limit", () => {
    // Five of those are more than express.json() accepts, so the body parser answers
    // before this function runs: the ceiling the client may use is smaller.
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

  it("shares one ceiling between hosted references and inline attachments", async () => {
    doc.bytesToText.mockResolvedValue("z".repeat(MAX_RESEARCH_CHARS));
    const res = fakeRes();
    const hosted = Array.from({ length: 3 }, (_unused, i) => ({ filename: `h${i}.pdf`, url: `https://files.example.com/h${i}` }));
    const inline = Array.from({ length: 2 }, (_unused, i) => ({
      source: "device",
      filename: `i${i}.pdf`,
      mediaType: "application/pdf",
      dataUrl: `data:application/pdf;base64,${Buffer.from("inline").toString("base64")}`,
    }));
    await handleResearch(7, request({ ...question, files: hosted, attachments: inline }), res as never);

    // 20k per file, 60k for the run: the three hosted references fill it, so every
    // attachment is named and skipped. One ceiling, not one per transport.
    const frames = res.frames.join("");
    const messages = engine.kemmaExecute.mock.calls[0][0].messages as Array<{ content: string }>;
    expect((messages[0].content.match(/File: /g) ?? []).length).toBe(3);
    expect(messages[0].content).toContain("File: h0.pdf");
    expect(frames).toContain("Skipped i0.pdf: the attachment budget is full.");
    expect(frames).toContain("Skipped i1.pdf: the attachment budget is full.");
  });

  it("refuses more than five files across both shapes", async () => {
    const res = fakeRes();
    const hosted = Array.from({ length: 4 }, (_unused, i) => ({ filename: `h${i}.pdf`, url: `https://files.example.com/h${i}` }));
    const inline = Array.from({ length: 2 }, (_unused, i) => ({ filename: `i${i}.pdf`, url: `data:application/pdf;base64,${Buffer.from("x").toString("base64")}` }));
    await expect(handleResearch(7, request({ ...question, files: [...hosted, ...inline] }), res as never)).rejects.toMatchObject({
      status: 400,
      message: "Up to 5 files can be researched at once.",
    });
    expect(res.frames).toHaveLength(0);
    expect(engine.kemmaExecute).not.toHaveBeenCalled();
  });

  it("answers 409 for a Drive attachment when Google is not connected", async () => {
    google.getConnectionStatus.mockResolvedValue({ connected: false, email: null });
    const res = fakeRes();
    const body = { ...question, attachments: [{ source: "drive", fileId: "drive-file-1", filename: "Doc" }] };
    await expect(handleResearch(7, request(body), res as never)).rejects.toMatchObject({
      status: 409,
      message: "Connect Google on the Connections page first.",
    });
    expect(google.getConnectionStatus).toHaveBeenCalledWith(7);
    expect(google.downloadDriveFile).not.toHaveBeenCalled();
  });

  it("names a Drive file that is not the user's and still researches", async () => {
    google.getDriveFileMeta.mockRejectedValue(new Error("404 not found, token detail"));
    const res = fakeRes();
    const body = { ...question, attachments: [{ source: "drive", fileId: "someone-elses-file", filename: "Private.pdf" }] };
    await handleResearch(7, request(body), res as never);

    const frames = res.frames.join("");
    expect(frames).toContain("Skipped Private.pdf: Private.pdf is not available to this Google account.");
    expect(frames).not.toContain("token detail");
    expect(engine.kemmaExecute).toHaveBeenCalled();
  });

  it("refuses an attachment list that is not valid before the stream opens", async () => {
    const res = fakeRes();
    await expect(handleResearch(7, request({ ...question, attachments: [{ source: "carrier-pigeon" }] }), res as never)).rejects.toBeInstanceOf(
      FnError
    );
    expect(res.frames).toHaveLength(0);
    expect(quota.checkQuota).not.toHaveBeenCalled();
  });
});
