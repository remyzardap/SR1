import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Google and the vision slot are mocked at the service and engine boundary: this
// suite never reaches the network, and no real token or file appears in it.
const google = vi.hoisted(() => ({
  getConnectionStatus: vi.fn(),
  getDriveFileMeta: vi.fn(),
  downloadDriveFile: vi.fn(),
  exportDriveFile: vi.fn(),
  listDriveAttachments: vi.fn(),
}));
const engine = vi.hoisted(() => ({ kemmaDocumentScan: vi.fn() }));
const quota = vi.hoisted(() => ({ getQuotaSummary: vi.fn() }));

vi.mock("../services/google", () => google);
vi.mock("../kemma/engine", () => engine);
vi.mock("../core/quotaCheck", () => quota);

import {
  MAX_ATTACHMENTS,
  MAX_FILE_CONTEXT_CHARS,
  MAX_TOTAL_CONTEXT_CHARS,
  REFERENCE_MAX_MB,
  attachmentLimits,
  attachmentNote,
  allowedMediaType,
  attachMaxBytes,
  hasDriveAttachment,
  isDataUrl,
  parseAttachmentFrom,
  parseAttachments,
  parseReferenceImages,
  referenceLimits,
  requireDriveConnection,
  resolveAttachment,
  attachmentsToContext,
  withContextOnLastUserMessage,
  type Attachment,
} from "./attachments";
import { FnError } from "./fnErrors";

const USER = 42;
const text = (value: string) => `data:text/plain;base64,${Buffer.from(value).toString("base64")}`;
const png = (bytes = "fake-png-bytes") => `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;

const device = (overrides: Partial<Attachment> = {}): Attachment => ({
  source: "device",
  filename: "notes.txt",
  mediaType: "text/plain",
  dataUrl: text("hello file"),
  ...overrides,
});

const drive = (overrides: Partial<Attachment> = {}): Attachment => ({
  source: "drive",
  fileId: "fake-drive-id-1",
  filename: "Deck.pdf",
  ...overrides,
});

const saved = new Map<string, string | undefined>();

beforeEach(() => {
  vi.clearAllMocks();
  saved.set("ATTACH_MAX_MB", process.env.ATTACH_MAX_MB);
  delete process.env.ATTACH_MAX_MB;
  quota.getQuotaSummary.mockResolvedValue({ tier: "pro" });
  google.getConnectionStatus.mockResolvedValue({ connected: true, email: "user@example.test" });
  google.downloadDriveFile.mockResolvedValue(Buffer.from("downloaded bytes"));
  google.exportDriveFile.mockResolvedValue(Buffer.from("exported bytes"));
  google.getDriveFileMeta.mockResolvedValue({
    id: "fake-drive-id-1",
    name: "Report",
    mimeType: "application/vnd.google-apps.document",
    isFolder: false,
  });
});

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

describe("parseAttachments: count, shape and limits", () => {
  it("takes nothing for an absent list", () => {
    expect(parseAttachments(undefined)).toEqual([]);
    expect(parseAttachments(null)).toEqual([]);
    expect(parseAttachments([])).toEqual([]);
  });

  it("keeps a device attachment as sent", () => {
    expect(parseAttachments([device()])).toEqual([
      { source: "device", filename: "notes.txt", mediaType: "text/plain", dataUrl: text("hello file") },
    ]);
  });

  it("refuses more than five files", () => {
    const six = Array.from({ length: MAX_ATTACHMENTS + 1 }, () => device());
    expect(() => parseAttachments(six)).toThrow(`Up to ${MAX_ATTACHMENTS} files can be attached to one request.`);
  });

  it("refuses a list that is not a list and an entry that is not an object", () => {
    expect(() => parseAttachments("nope")).toThrow("attachments is not valid.");
    expect(() => parseAttachments(["x"])).toThrow(FnError);
    expect(() => parseAttachments([{ source: "carrier-pigeon" }])).toThrow(FnError);
  });

  it("names the missing field instead of a generic complaint", () => {
    expect(() => parseAttachments([{ source: "device", filename: "a.txt", dataUrl: 42 }])).toThrow("a.txt has no file data.");
    expect(() => parseAttachments([{ source: "drive", filename: "a.txt" }])).toThrow("a.txt has no Google Drive file id.");
    expect(() => parseAttachments([{ source: "device", dataUrl: text("x") }])).toThrow("An attachment has no file name.");
  });

  it("accepts a Drive file by id alone", () => {
    expect(parseAttachments([{ source: "drive", fileId: "  fake-drive-id-1 " }])).toEqual([
      { source: "drive", fileId: "fake-drive-id-1" },
    ]);
  });

  it("refuses a data URL that is not base64 or has no payload", () => {
    expect(() => parseAttachments([{ source: "device", filename: "a.txt", dataUrl: "http://files.example/a.txt" }])).toThrow(
      "a.txt is not a base64 data URL."
    );
    expect(() => parseAttachments([{ source: "device", filename: "a.txt", dataUrl: "data:text/plain;base64," }])).toThrow("a.txt is empty.");
  });

  it("refuses a type outside the allowed list", () => {
    const exe = `data:application/x-msdownload;base64,${Buffer.from("MZ").toString("base64")}`;
    expect(() => parseAttachments([{ source: "device", filename: "tool.exe", dataUrl: exe }])).toThrow(
      "That file type cannot be attached: tool.exe."
    );
  });

  it("refuses a Google-native type from a device upload", () => {
    const native = "data:application/vnd.google-apps.document;base64," + Buffer.from("x").toString("base64");
    expect(() => parseAttachments([{ source: "device", filename: "Doc", dataUrl: native }])).toThrow(FnError);
  });

  it("takes the type from the file name when the data URL says nothing", () => {
    const octet = "data:application/octet-stream;base64," + Buffer.from("a,b\n1,2").toString("base64");
    const [att] = parseAttachments([{ source: "device", filename: "sheet.csv", dataUrl: octet }]);
    expect(att).toMatchObject({ mediaType: "text/csv" });
  });

  it("holds the 10 MB ceiling and follows ATTACH_MAX_MB", () => {
    expect(attachMaxBytes()).toBe(10 * 1024 * 1024);
    process.env.ATTACH_MAX_MB = "1";
    expect(attachMaxBytes()).toBe(1024 * 1024);
    const big = "data:text/plain;base64," + Buffer.alloc(2 * 1024 * 1024, 120).toString("base64");
    expect(() => parseAttachments([{ source: "device", filename: "big.txt", dataUrl: big }])).toThrow("big.txt is over the 1 MB limit.");

    process.env.ATTACH_MAX_MB = "nonsense";
    expect(attachMaxBytes()).toBe(10 * 1024 * 1024);
  });

  it("answers an over-size file with 413, not 400", () => {
    process.env.ATTACH_MAX_MB = "1";
    const big = "data:text/plain;base64," + Buffer.alloc(3 * 1024 * 1024, 120).toString("base64");
    let caught: unknown;
    try {
      parseAttachments([{ source: "device", filename: "big.txt", dataUrl: big }]);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ status: 413 });
  });

  it("reads the file name into a sane length", () => {
    expect(() => parseAttachments([{ source: "device", filename: "x".repeat(300), dataUrl: text("a") }])).toThrow(FnError);
  });
});

describe("allowedMediaType", () => {
  it("accepts the contracted types and their aliases", () => {
    const limits = attachmentLimits();
    expect(allowedMediaType("a.png", "image/png", limits)).toBe("image/png");
    expect(allowedMediaType("a.jpg", "image/jpg", limits)).toBe("image/jpeg");
    expect(allowedMediaType("a.webp", "image/webp", limits)).toBe("image/webp");
    expect(allowedMediaType("a.gif", "image/gif", limits)).toBe("image/gif");
    expect(allowedMediaType("a.pdf", "application/pdf", limits)).toBe("application/pdf");
    expect(allowedMediaType("a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", limits)).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(allowedMediaType("a.txt", "text/plain", limits)).toBe("text/plain");
    expect(allowedMediaType("a.md", "text/x-markdown", limits)).toBe("text/markdown");
    expect(allowedMediaType("a.csv", "text/csv", limits)).toBe("text/csv");
    expect(allowedMediaType("Doc", "application/vnd.google-apps.document", limits)).toBe("application/vnd.google-apps.document");
  });

  it("rejects anything else", () => {
    const limits = attachmentLimits();
    expect(allowedMediaType("a.zip", "application/zip", limits)).toBe("");
    expect(allowedMediaType("noextension", "", limits)).toBe("");
  });

  it("keeps reference photos to png, jpeg and webp", () => {
    const limits = referenceLimits();
    expect(allowedMediaType("a.png", "image/png", limits)).toBe("image/png");
    expect(allowedMediaType("a.gif", "image/gif", limits)).toBe("");
    expect(allowedMediaType("a.txt", "text/plain", limits)).toBe("");
  });
});

describe("parseReferenceImages", () => {
  it("allows two pictures at most", () => {
    expect(parseReferenceImages([png(), png()].map((dataUrl) => ({ source: "device", filename: "r.png", dataUrl })))).toHaveLength(2);
    const three = Array.from({ length: 3 }, () => ({ source: "device", filename: "r.png", dataUrl: png() }));
    expect(() => parseReferenceImages(three)).toThrow("Up to 2 files can be attached to one request.");
  });

  it("refuses a document where a photo is expected", () => {
    expect(() => parseReferenceImages([{ source: "device", filename: "notes.txt", dataUrl: text("hi") }])).toThrow(FnError);
  });

  it("holds the 8 MB reference ceiling of its own", () => {
    expect(referenceLimits().maxBytes).toBe(REFERENCE_MAX_MB * 1024 * 1024);
  });

  it("reads the Drive reference of a picture", () => {
    expect(parseReferenceImages([{ source: "drive", fileId: "fake-photo-id", filename: "photo.png" }])).toEqual([
      { source: "drive", fileId: "fake-photo-id", filename: "photo.png" },
    ]);
  });
});

describe("parseAttachmentFrom", () => {
  it("validates the single attachment of a document brief", () => {
    expect(parseAttachmentFrom(device())).toMatchObject({ source: "device", filename: "notes.txt" });
    expect(() => parseAttachmentFrom("nope")).toThrow("attachment is not valid.");
    expect(() => parseAttachmentFrom(null)).toThrow("attachment is not valid.");
  });
});

describe("resolveAttachment: device files", () => {
  it("decodes a data URL into bytes and a type", async () => {
    const file = await resolveAttachment(USER, device());
    expect(file).toEqual({ filename: "notes.txt", mediaType: "text/plain", bytes: Buffer.from("hello file") });
    expect(google.getDriveFileMeta).not.toHaveBeenCalled();
  });

  it("adds the extension a bare name is missing, so readers can classify it", async () => {
    const att: Attachment = { source: "device", filename: "summary", mediaType: "text/markdown", dataUrl: text("# hi") };
    expect((await resolveAttachment(USER, att)).filename).toBe("summary.md");
  });

  it("refuses bytes over the limit at the decode as well", async () => {
    process.env.ATTACH_MAX_MB = "1";
    // parseAttachments is skipped here on purpose: resolveAttachment has the last word.
    const att: Attachment = {
      source: "device",
      filename: "edge.txt",
      mediaType: "text/plain",
      dataUrl: "data:text/plain;base64," + Buffer.alloc(2 * 1024 * 1024, 65).toString("base64"),
    };
    await expect(resolveAttachment(USER, att)).rejects.toMatchObject({ status: 413, message: "edge.txt is over the 1 MB limit." });
  });
});

describe("resolveAttachment: Drive files", () => {
  it("downloads an ordinary file through the user's own connection", async () => {
    google.getDriveFileMeta.mockResolvedValue({ id: "pdf1", name: "Report.pdf", mimeType: "application/pdf", size: 100, isFolder: false });
    const file = await resolveAttachment(USER, drive({ fileId: "pdf1" }));
    expect(google.getDriveFileMeta).toHaveBeenCalledWith(USER, "pdf1");
    expect(google.downloadDriveFile).toHaveBeenCalledWith(USER, "pdf1", 10 * 1024 * 1024);
    expect(file).toEqual({ filename: "Report.pdf", mediaType: "application/pdf", bytes: Buffer.from("downloaded bytes") });
  });

  it("enforces the ceiling from the metadata before any transfer", async () => {
    google.getDriveFileMeta.mockResolvedValue({
      id: "big1",
      name: "Huge.pdf",
      mimeType: "application/pdf",
      size: 30 * 1024 * 1024,
      isFolder: false,
    });
    await expect(resolveAttachment(USER, drive({ fileId: "big1", filename: "Huge.pdf" }))).rejects.toMatchObject({ status: 413 });
    expect(google.downloadDriveFile).not.toHaveBeenCalled();
  });

  it("keeps a file that grows past the ceiling mid-transfer out", async () => {
    process.env.ATTACH_MAX_MB = "1";
    google.getDriveFileMeta.mockResolvedValue({ id: "pdf1", name: "Report.pdf", mimeType: "application/pdf", isFolder: false });
    google.downloadDriveFile.mockResolvedValue(Buffer.alloc(2 * 1024 * 1024, 65));
    await expect(resolveAttachment(USER, drive({ fileId: "pdf1", filename: "Report.pdf" }))).rejects.toMatchObject({ status: 413 });
  });

  it("exports a Google Doc, preferring markdown and keeping the name", async () => {
    const file = await resolveAttachment(USER, drive());
    expect(google.exportDriveFile).toHaveBeenCalledWith(USER, "fake-drive-id-1", "text/markdown", 10 * 1024 * 1024);
    expect(google.downloadDriveFile).not.toHaveBeenCalled();
    expect(file).toEqual({ filename: "Report.md", mediaType: "text/markdown", bytes: Buffer.from("exported bytes") });
  });

  it("falls back to the pdf export when Google refuses markdown", async () => {
    google.exportDriveFile.mockImplementation(async (_u: number, _f: string, mimeType: string) => {
      if (mimeType === "text/markdown") throw new Error("Export format unsupported");
      return Buffer.from("%PDF-1.4 fake");
    });
    const file = await resolveAttachment(USER, drive());
    expect(file).toMatchObject({ filename: "Report.pdf", mediaType: "application/pdf" });
  });

  it("exports a Sheet as csv and a Slides deck as pdf", async () => {
    google.getDriveFileMeta.mockResolvedValue({ id: "s1", name: "Numbers", mimeType: "application/vnd.google-apps.spreadsheet", isFolder: false });
    expect(await resolveAttachment(USER, drive({ fileId: "s1", filename: "Numbers" }))).toMatchObject({
      filename: "Numbers.csv",
      mediaType: "text/csv",
    });

    google.getDriveFileMeta.mockResolvedValue({ id: "p1", name: "Deck", mimeType: "application/vnd.google-apps.presentation", isFolder: false });
    expect(await resolveAttachment(USER, drive({ fileId: "p1", filename: "Deck" }))).toMatchObject({
      filename: "Deck.pdf",
      mediaType: "application/pdf",
    });
  });

  it("refuses a folder and a type this server cannot read", async () => {
    google.getDriveFileMeta.mockResolvedValue({ id: "f1", name: "Pics", mimeType: "application/vnd.google-apps.folder", isFolder: true });
    await expect(resolveAttachment(USER, drive({ fileId: "f1" }))).rejects.toMatchObject({ status: 400, message: "Pics is a folder, not a file." });

    google.getDriveFileMeta.mockResolvedValue({ id: "z1", name: "pack.zip", mimeType: "application/zip", isFolder: false });
    await expect(resolveAttachment(USER, drive({ fileId: "z1" }))).rejects.toMatchObject({ status: 400 });
  });

  it("fails a file that is not the user's, without saying more than that", async () => {
    google.getDriveFileMeta.mockRejectedValue(new Error("403 The user does not have permission, token leaked detail"));
    let caught: FnError;
    try {
      await resolveAttachment(USER, drive({ fileId: "someone-elses-file" }));
      throw new Error("should have failed");
    } catch (err) {
      caught = err as FnError;
    }
    expect(caught).toBeInstanceOf(FnError);
    expect(caught.status).toBe(404);
    expect(caught.message).not.toContain("token");
    expect(caught.message).toContain("not available to this Google account");
  });
});

describe("requireDriveConnection", () => {
  it("answers 409 with the contract text when Google is not connected", async () => {
    google.getConnectionStatus.mockResolvedValue({ connected: false, email: null });
    await expect(requireDriveConnection(USER)).rejects.toMatchObject({ status: 409, message: "Connect Google on the Connections page first." });
  });

  it("passes when it is connected, and only ever asks about the session user", async () => {
    await expect(requireDriveConnection(USER)).resolves.toBeUndefined();
    expect(google.getConnectionStatus).toHaveBeenCalledWith(USER);
  });

  it("knows a list that needs Drive", () => {
    expect(hasDriveAttachment([device(), drive()])).toBe(true);
    expect(hasDriveAttachment([device()])).toBe(false);
  });
});

describe("attachmentsToContext", () => {
  it("puts every document in one labelled block", async () => {
    google.getDriveFileMeta.mockResolvedValue({ id: "t1", name: "more.txt", mimeType: "text/plain", isFolder: false });
    const context = await attachmentsToContext(USER, [device(), drive({ fileId: "t1", filename: "more.txt" })]);

    expect(context.notices).toEqual([]);
    expect(context.names).toEqual(["notes.txt", "more.txt"]);
    expect(context.text).toContain("ATTACHMENTS PROVIDED BY THE USER");
    expect(context.text).toContain("File: notes.txt\nhello file");
    expect(context.text).toContain("File: more.txt\ndownloaded bytes");
  });

  it("describes an image with the vision slot and labels it as an image", async () => {
    engine.kemmaDocumentScan.mockResolvedValue({ text: "A lighthouse at dusk.\nLIGHTHOUSE", modelsUsed: ["vision"], durationMs: 5 });
    const context = await attachmentsToContext(USER, [
      { source: "device", filename: "photo.png", mediaType: "image/png", dataUrl: png() },
    ]);
    expect(engine.kemmaDocumentScan).toHaveBeenCalledTimes(1);
    const scanInput = engine.kemmaDocumentScan.mock.calls[0][0];
    expect(scanInput.mimeType).toBe("image/png");
    expect(Buffer.from(scanInput.imageData, "base64").toString()).toBe("fake-png-bytes");
    expect(scanInput.prompt).toContain("transcribe");
    expect(context.text).toContain("Image: photo.png");
    expect(context.text).toContain("A lighthouse at dusk.");
  });

  it("turns a failing file into a notice and keeps the others", async () => {
    google.getDriveFileMeta.mockResolvedValue({ id: "bad1", name: "Broken.pdf", mimeType: "application/pdf", isFolder: false });
    google.downloadDriveFile.mockRejectedValue(new Error("upstream said no"));
    const context = await attachmentsToContext(USER, [device(), drive({ fileId: "bad1", filename: "Broken.pdf" })]);

    expect(context.text).toContain("File: notes.txt");
    expect(context.notices).toEqual(["Skipped Broken.pdf: Broken.pdf could not be read from Google Drive."]);
    expect(JSON.stringify(context)).not.toContain("upstream said no");
  });

  it("notices an empty document instead of adding a blank block", async () => {
    const context = await attachmentsToContext(USER, [
      { source: "device", filename: "blank.txt", mediaType: "text/plain", dataUrl: text("   ") },
    ]);
    expect(context.text).toBe("");
    expect(context.notices).toEqual(["Skipped blank.txt: no readable text."]);
    expect(context.names).toEqual(["blank.txt"]);
  });

  it("caps one file at 20000 characters", async () => {
    const huge = text("x".repeat(40000));
    const context = await attachmentsToContext(USER, [{ source: "device", filename: "long.txt", mediaType: "text/plain", dataUrl: huge }]);
    expect(context.text).toContain("x".repeat(MAX_FILE_CONTEXT_CHARS));
    expect(context.text).not.toContain("x".repeat(MAX_FILE_CONTEXT_CHARS + 1));
  });

  it("caps the whole block and names what did not fit", async () => {
    const five = Array.from({ length: MAX_ATTACHMENTS }, (_unused, i) => ({
      source: "device" as const,
      filename: `f${i}.txt`,
      mediaType: "text/plain",
      dataUrl: text("y".repeat(19000)),
    }));
    const context = await attachmentsToContext(USER, five);
    const included = (context.text.match(/File: f/g) ?? []).length;
    expect(included).toBeLessThan(MAX_ATTACHMENTS);
    expect(context.text.length).toBeLessThan(MAX_TOTAL_CONTEXT_CHARS + 2000);
    expect(context.notices.some((n) => n.includes("the attachment budget is full."))).toBe(true);
  });

  it("respects a smaller budget handed over by another block", async () => {
    const context = await attachmentsToContext(USER, [device(), device({ filename: "second.txt" })], { maxTotalChars: 6 });
    expect(context.text).toContain("hello ");
    expect(context.notices).toEqual(["Skipped second.txt: the attachment budget is full."]);
  });

  it("notices every file when nothing of the budget is left", async () => {
    const context = await attachmentsToContext(USER, [device()], { maxTotalChars: 0 });
    expect(context.text).toBe("");
    expect(context.notices).toEqual(["Skipped notes.txt: the attachment budget is full."]);
  });

  it("describes nothing when there is nothing attached", async () => {
    expect(await attachmentsToContext(USER, [])).toEqual({ text: "", notices: [], names: [] });
    expect(engine.kemmaDocumentScan).not.toHaveBeenCalled();
  });
});

describe("notes for the stored message", () => {
  it("lists the names and nothing of the text", () => {
    const note = attachmentNote(["report.pdf", "photo.png"]);
    expect(note).toBe("Attached files: report.pdf, photo.png");
    expect(attachmentNote([])).toBe("");
  });

  it("appends to the last user message only, on a copy", () => {
    const messages = [
      { role: "user", content: "first" },
      { role: "assistant", content: "answer" },
      { role: "user", content: "look at these" },
    ];
    const out = withContextOnLastUserMessage(messages, "CTX");
    expect(out[2].content).toBe("look at these\n\nCTX");
    expect(out[0].content).toBe("first");
    expect(messages[2].content).toBe("look at these");
    expect(withContextOnLastUserMessage(messages, "")).toBe(messages);
  });
});

describe("helpers the routes reuse", () => {
  it("recognises the inline data URL shape", () => {
    expect(isDataUrl(text("x"))).toBe(true);
    expect(isDataUrl("  " + png() + " ")).toBe(true);
    expect(isDataUrl("https://files.example/a.pdf")).toBe(false);
    expect(isDataUrl("data:text/plain,plain")).toBe(false);
    expect(isDataUrl("")).toBe(false);
  });
});


describe("total size cap per request", () => {
  const device = (name: string, mb: number) => ({
    source: "device" as const,
    filename: name,
    mediaType: "text/plain",
    dataUrl: "data:text/plain;base64," + Buffer.alloc(mb * 1024 * 1024, 97).toString("base64"),
  });

  it("accepts several files that fit together", () => {
    expect(parseAttachments([device("a.txt", 7), device("b.txt", 7), device("c.txt", 5)])).toHaveLength(3);
  });

  it("refuses a request whose files add up to more than 20 MB, even when each file is under the per-file limit", () => {
    expect(() => parseAttachments([device("a.txt", 9), device("b.txt", 9), device("c.txt", 9)])).toThrow(/20 MB total/);
  });

  it("does not count Drive attachments, which are downloaded and capped on the server", () => {
    const drive = { source: "drive" as const, fileId: "abc123" };
    expect(parseAttachments([device("a.txt", 9), device("b.txt", 9), drive, drive])).toHaveLength(4);
  });
});
