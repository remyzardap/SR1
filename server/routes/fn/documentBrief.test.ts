import { describe, it, expect, vi, beforeEach } from "vitest";

const doc = vi.hoisted(() => ({ documentText: vi.fn(), bytesToText: vi.fn() }));
const llm = vi.hoisted(() => ({
  stream: vi.fn(),
  LlmUnavailableError: class LlmUnavailableError extends Error {},
}));
// The Drive half of an attachment request is faked at the Google service: no
// network, no credentials, obvious ids.
const google = vi.hoisted(() => ({
  getConnectionStatus: vi.fn(),
  getDriveFileMeta: vi.fn(),
  downloadDriveFile: vi.fn(),
  exportDriveFile: vi.fn(),
}));

vi.mock("../../lib/fnDocument", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/fnDocument")>()),
  documentText: doc.documentText,
  bytesToText: doc.bytesToText,
}));
vi.mock("../../lib/fnLlm", () => ({ stream: llm.stream, LlmUnavailableError: llm.LlmUnavailableError }));
vi.mock("../../services/google", () => google);

import { MAX_BRIEF_DOC_CHARS, MAX_BRIEF_FILE_CHARS, handleDocumentBrief, readPayload } from "./documentBrief";
import { FnError } from "../../lib/fnErrors";

const request = (body: unknown) => ({ body, on: () => {} } as never);

function fakeRes() {
  const res = {
    frames: [] as string[],
    headers: {} as Record<string, string>,
    ended: false,
    writableEnded: false,
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    flushHeaders() {},
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

beforeEach(() => {
  vi.clearAllMocks();
  doc.documentText.mockResolvedValue({ text: "Quarterly report. Revenue 12.4B.", chars: 34 });
  doc.bytesToText.mockResolvedValue("Quarterly report. Revenue 12.4B.");
  google.getConnectionStatus.mockResolvedValue({ connected: true, email: "user@example.test" });
  google.downloadDriveFile.mockResolvedValue(Buffer.from("%PDF-1.4 fake bytes"));
  google.exportDriveFile.mockResolvedValue(Buffer.from("# exported markdown"));
  google.getDriveFileMeta.mockResolvedValue({ id: "drive-1", name: "Q3", mimeType: "application/pdf", size: 200, isFolder: false });
  llm.stream.mockImplementation(async (_messages: unknown, _options: unknown, onToken: (t: string) => void) => {
    onToken("## Overview\n");
    onToken("A quarterly report.");
    return { text: "## Overview\nA quarterly report.", model: "test-model", provider: "qwen" };
  });
});

describe("readPayload", () => {
  it("accepts the two shapes BriefDialog.tsx sends", () => {
    expect(readPayload({ filename: "notes.md", text: "hello" })).toEqual({ filename: "notes.md", text: "hello", file: undefined, mediaType: undefined });
    expect(
      readPayload({ filename: "deck.pdf", file: "data:application/pdf;base64,AAAA", mediaType: "application/pdf" })
    ).toEqual({ filename: "deck.pdf", text: undefined, file: "data:application/pdf;base64,AAAA", mediaType: "application/pdf" });
  });

  it("requires a filename and some content", () => {
    expect(() => readPayload({ text: "orphan text" })).toThrowError("Filename is required.");
    expect(() => readPayload({ filename: "a.txt" })).toThrowError("A document is required.");
  });

  it("refuses a document over the model window", () => {
    expect(() => readPayload({ filename: "big.txt", text: "x".repeat(MAX_BRIEF_DOC_CHARS + 1) })).toThrowError(FnError);
  });

  it("refuses an upload past what the JSON body limit allows", () => {
    let caught: unknown;
    try {
      readPayload({ filename: "big.pdf", file: "A".repeat(MAX_BRIEF_FILE_CHARS + 1), mediaType: "application/pdf" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ status: 413, message: "Uploaded documents must stay under 7 MB." });
  });

  it("accepts an upload right up to that ceiling", () => {
    expect(readPayload({ filename: "ok.pdf", file: "A".repeat(MAX_BRIEF_FILE_CHARS) }).file).toHaveLength(MAX_BRIEF_FILE_CHARS);
  });

  it("takes the attachment shape instead of the inline fields", () => {
    const att = { source: "device", filename: "deck.pdf", mediaType: "application/pdf", dataUrl: "data:application/pdf;base64,AAAA" };
    const payload = readPayload({ attachment: att });
    expect(payload.filename).toBe("deck.pdf");
    expect(payload.attachment).toMatchObject({ source: "device", filename: "deck.pdf", mediaType: "application/pdf" });
    expect(payload.text).toBeUndefined();
    expect(payload.file).toBeUndefined();
  });

  it("prefers the top-level filename when an attachment brings its own", () => {
    const att = { source: "drive", fileId: "drive-1", filename: "Google Doc" };
    expect(readPayload({ filename: "kept.name.md", attachment: att }).filename).toBe("kept.name.md");
  });

  it("names a Drive file with no name of its own document", () => {
    const payload = readPayload({ attachment: { source: "drive", fileId: "drive-1" } });
    expect(payload.filename).toBe("document");
    expect(payload.attachment).toMatchObject({ source: "drive", fileId: "drive-1" });
  });

  it("still needs some content alongside an invalid attachment", () => {
    expect(() => readPayload({ attachment: { source: "device", filename: "a.txt" } })).toThrow("a.txt has no file data.");
    expect(() => readPayload({ attachment: "nope" })).toThrow("attachment is not valid.");
  });
});

describe("document-brief from an attachment", () => {
  const drivePdf = { source: "drive", fileId: "drive-1", filename: "Q3 report.pdf" };

  it("briefs the Drive file's text, not its id", async () => {
    const res = fakeRes();
    await handleDocumentBrief(7, request({ attachment: drivePdf }), res as never);

    expect(google.getDriveFileMeta).toHaveBeenCalledWith(7, "drive-1");
    expect(google.downloadDriveFile).toHaveBeenCalledWith(7, "drive-1", 10 * 1024 * 1024);
    expect(doc.documentText).not.toHaveBeenCalled();
    const prompt = llm.stream.mock.calls[0][0][1].content as string;
    expect(prompt).toContain("Filename: Q3 report.pdf");
    expect(prompt).toContain("Quarterly report");
    expect(prompt).not.toContain("drive-1");
    expect(JSON.parse(res.frames[2].split("data: ")[1])).toMatchObject({ filename: "Q3 report.pdf" });
  });

  it("exports a Google-native file and briefs the export", async () => {
    google.getDriveFileMeta.mockResolvedValue({
      id: "drive-2",
      name: "Meeting notes",
      mimeType: "application/vnd.google-apps.document",
      isFolder: false,
    });
    await handleDocumentBrief(7, request({ attachment: { source: "drive", fileId: "drive-2", filename: "Meeting notes" } }), fakeRes() as never);

    expect(google.exportDriveFile).toHaveBeenCalledWith(7, "drive-2", "text/markdown", 10 * 1024 * 1024);
    expect(google.downloadDriveFile).not.toHaveBeenCalled();
    expect(doc.bytesToText).toHaveBeenCalledWith({ filename: "Meeting notes.md", mediaType: "text/markdown" }, expect.any(Buffer), 7);
  });

  it("reads a device attachment from the body without touching Drive", async () => {
    const att = {
      source: "device",
      filename: "notes.md",
      mediaType: "text/markdown",
      dataUrl: "data:text/markdown;base64," + Buffer.from("# Quarterly report").toString("base64"),
    };
    const res = fakeRes();
    await handleDocumentBrief(7, request({ attachment: att }), res as never);
    expect(google.getDriveFileMeta).not.toHaveBeenCalled();
    expect(doc.bytesToText).toHaveBeenCalledWith({ filename: "notes.md", mediaType: "text/markdown" }, Buffer.from("# Quarterly report"), 7);
    expect(llm.stream).toHaveBeenCalled();
    expect(res.frames[2]).toContain("event: done");
  });

  it("answers 409 for a Drive file when Google is not connected, before the stream opens", async () => {
    google.getConnectionStatus.mockResolvedValue({ connected: false, email: null });
    const res = fakeRes();
    await expect(handleDocumentBrief(7, request({ attachment: drivePdf }), res as never)).rejects.toMatchObject({
      status: 409,
      message: "Connect Google on the Connections page first.",
    });
    expect(res.frames).toHaveLength(0);
    expect(google.downloadDriveFile).not.toHaveBeenCalled();
  });

  it("refuses a Drive file that is not readable without leaking the upstream fault", async () => {
    google.getDriveFileMeta.mockRejectedValue(new Error("403, bearer abc123 rejected"));
    let caught: unknown;
    try {
      await handleDocumentBrief(7, request({ attachment: drivePdf }), fakeRes() as never);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ status: 404, message: "Q3 report.pdf is not available to this Google account." });
    expect(String(caught)).not.toContain("abc123");
  });

  it("says a file over the size ceiling is refused, at 413", async () => {
    google.getDriveFileMeta.mockResolvedValue({ id: "drive-3", name: "Huge.pdf", mimeType: "application/pdf", size: 40 * 1024 * 1024, isFolder: false });
    await expect(
      handleDocumentBrief(7, request({ attachment: { source: "drive", fileId: "drive-3", filename: "Huge.pdf" } }), fakeRes() as never)
    ).rejects.toMatchObject({ status: 413, message: "Huge.pdf is over the 10 MB limit." });
  });
});

describe("document-brief stream", () => {
  it("emits token, then done, with the event names kemmaCloud dispatches on", async () => {
    const res = fakeRes();
    await handleDocumentBrief(7, request({ filename: "notes.md", text: "hello" }), res as never);

    expect(res.headers["Content-Type"]).toBe("text/event-stream");
    expect(res.frames[0]).toBe('event: token\ndata: "## Overview\\n"\n\n');
    expect(res.frames[1]).toContain("A quarterly report.");
    expect(res.frames[2]).toMatch(/^event: done\ndata: /);
    expect(JSON.parse(res.frames[2].split("data: ")[1])).toEqual({
      model: "test-model",
      filename: "notes.md",
      chars: 34,
    });
    expect(res.ended).toBe(true);
  });

  it("streams over extracted PDF text, not the upload", async () => {
    await handleDocumentBrief(7, request({ filename: "deck.pdf", file: "data:application/pdf;base64,AAAA" }), fakeRes() as never);
    expect(doc.documentText).toHaveBeenCalledWith(
      { filename: "deck.pdf", text: undefined, file: "data:application/pdf;base64,AAAA", mediaType: undefined },
      7
    );
    const prompt = llm.stream.mock.calls[0][0][1].content as string;
    expect(prompt).toContain("Quarterly report");
    expect(prompt).not.toContain("AAAA");
  });

  it("reports a model failure as an error event the client can show", async () => {
    llm.stream.mockRejectedValueOnce(new Error("upstream blew up"));
    const res = fakeRes();
    await handleDocumentBrief(7, request({ filename: "notes.md", text: "hello" }), res as never);
    const last = res.frames[res.frames.length - 1];
    expect(last).toMatch(/^event: error\ndata: /);
    expect(JSON.parse(last.split("data: ")[1])).toEqual({
      message: "The brief could not be completed. Please try again.",
      retryable: true,
    });
  });

  it("says a document has no readable text before opening the stream", async () => {
    doc.documentText.mockResolvedValueOnce({ text: "   ", chars: 0 });
    const res = fakeRes();
    await expect(
      handleDocumentBrief(7, request({ filename: "scan.pdf", file: "data:application/pdf;base64,AAAA" }), res as never)
    ).rejects.toThrow("That document has no readable text.");
    expect(res.frames).toHaveLength(0);
  });

  it("passes a file-type rejection through as JSON", async () => {
    doc.documentText.mockRejectedValueOnce(new FnError(415, "Only PDF, Word, Markdown and text files can be briefed."));
    await expect(handleDocumentBrief(7, request({ filename: "x.zip", file: "data:application/zip;base64,AAAA" }), fakeRes() as never)).rejects.toMatchObject({
      status: 415,
    });
  });
});
