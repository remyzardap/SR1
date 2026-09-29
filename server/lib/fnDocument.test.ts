import { describe, it, expect, vi, beforeEach } from "vitest";

const engine = vi.hoisted(() => ({ kemmaDocumentScan: vi.fn() }));
const quota = vi.hoisted(() => ({ getQuotaSummary: vi.fn() }));

vi.mock("../kemma/engine", () => engine);
vi.mock("../core/quotaCheck", () => quota);

import { MAX_UPLOAD_BYTES, documentText, splitDataUrl } from "./fnDocument";
import { FnError } from "./fnErrors";

const dataUrl = (base64: string, mime = "application/pdf") => `data:${mime};base64,${base64}`;

beforeEach(() => {
  vi.clearAllMocks();
  quota.getQuotaSummary.mockResolvedValue({ tier: "pro" });
  engine.kemmaDocumentScan.mockResolvedValue({ text: "Extracted PDF text." });
});

describe("splitDataUrl", () => {
  it("reads the media type and payload from a data URL", () => {
    expect(splitDataUrl(dataUrl("QUJD", "application/pdf"))).toEqual({ mediaType: "application/pdf", base64: "QUJD" });
  });

  it("accepts a bare base64 string with the declared type", () => {
    expect(splitDataUrl("QUJDRA==", "text/plain")).toEqual({ mediaType: "text/plain", base64: "QUJDRA==" });
  });

  it("tolerates a charset parameter and whitespace", () => {
    expect(splitDataUrl("data:text/plain;charset=utf-8;base64,QUJ\nCD").mediaType).toBe("text/plain");
    expect(splitDataUrl("data:text/plain;charset=utf-8;base64,QUJ\nCD").base64).toBe("QUJCD");
  });
});

describe("documentText", () => {
  it("uses inline text without calling any model", async () => {
    const out = await documentText({ filename: "notes.md", text: "  hello  " }, 7);
    expect(out).toEqual({ text: "hello", chars: 5 });
    expect(engine.kemmaDocumentScan).not.toHaveBeenCalled();
  });

  it("sends a PDF to the vision slot and keeps the extracted text", async () => {
    const out = await documentText({ filename: "deck.pdf", file: dataUrl("QUJD") }, 7);
    expect(out.text).toBe("Extracted PDF text.");
    expect(engine.kemmaDocumentScan).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, mimeType: "application/pdf", tier: "pro" })
    );
  });

  it("refuses a file type it cannot read", async () => {
    await expect(documentText({ filename: "archive.zip", file: dataUrl("QUJD", "application/zip") }, 7)).rejects.toMatchObject({
      status: 415,
    });
    expect(engine.kemmaDocumentScan).not.toHaveBeenCalled();
  });

  it("enforces the upload cap on the decoded bytes", async () => {
    const huge = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 65).toString("base64");
    await expect(documentText({ filename: "big.pdf", file: dataUrl(huge) }, 7)).rejects.toMatchObject({
      status: 413,
      message: "Uploaded documents must stay under 7 MB.",
    });
  });

  it("says so when a PDF carries no text", async () => {
    engine.kemmaDocumentScan.mockResolvedValueOnce({ text: "   " });
    await expect(documentText({ filename: "scan.pdf", file: dataUrl("QUJD") }, 7)).rejects.toMatchObject({ status: 422 });
  });

  it("reads a plain text data URL without a model call", async () => {
    const text = Buffer.from("plain body").toString("base64");
    const out = await documentText({ filename: "notes.txt", file: dataUrl(text, "text/plain") }, 7);
    expect(out.text).toBe("plain body");
    expect(engine.kemmaDocumentScan).not.toHaveBeenCalled();
  });

  it("unzips a DOCX and drops the markup", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("word/document.xml", "<w:document><w:p><w:t>Total</w:t></w:p><w:p><w:t>12.4 billion</w:t></w:p></w:document>");
    const base64 = (await zip.generateAsync({ type: "nodebuffer" })).toString("base64");

    const out = await documentText({ filename: "report.docx", file: dataUrl(base64, "application/vnd.openxmlformats-officedocument.wordprocessingml.document") }, 7);
    expect(out.text).toContain("Total");
    expect(out.text).toContain("12.4 billion");
    expect(out.text).not.toContain("<w:t>");
    expect(engine.kemmaDocumentScan).not.toHaveBeenCalled();
  });

  it("rejects a DOCX with no document part", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("word/styles.xml", "<styles/>");
    const base64 = (await zip.generateAsync({ type: "nodebuffer" })).toString("base64");

    await expect(
      documentText({ filename: "empty.docx", file: dataUrl(base64, "application/vnd.openxmlformats-officedocument.wordprocessingml.document") }, 7)
    ).rejects.toBeInstanceOf(FnError);
  });
});
