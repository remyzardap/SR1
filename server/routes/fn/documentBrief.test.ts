import { describe, it, expect, vi, beforeEach } from "vitest";

const doc = vi.hoisted(() => ({ documentText: vi.fn() }));
const llm = vi.hoisted(() => ({
  stream: vi.fn(),
  LlmUnavailableError: class LlmUnavailableError extends Error {},
}));

vi.mock("../../lib/fnDocument", () => doc);
vi.mock("../../lib/fnLlm", () => ({ stream: llm.stream, LlmUnavailableError: llm.LlmUnavailableError }));

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
