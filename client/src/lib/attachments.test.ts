import { describe, expect, it } from "vitest";
import {
  ACCEPT,
  DOCUMENT_ACCEPT,
  IMAGE_ACCEPT,
  MAX_BYTES,
  MAX_FILES,
  MAX_MB,
  attachmentKey,
  attachmentName,
  attachmentSize,
  dataUrlToText,
  fileToAttachment,
  formatBytes,
  isImageType,
  isTextType,
  mediaTypeOf,
  sizeFromDataUrl,
  validateDeviceFiles,
  attachmentBytes,
} from "./attachments";

function makeFile(name: string, type: string, bytes: number): File {
  const content = new Uint8Array(bytes).fill(65);
  return new File([content], name, { type });
}

describe("constants", () => {
  it("matches the shared contract", () => {
    expect(MAX_FILES).toBe(5);
    expect(MAX_MB).toBe(10);
    expect(MAX_BYTES).toBe(10 * 1024 * 1024);
  });

  it("lists every allowed type in ACCEPT", () => {
    for (const token of ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "text/plain", "text/markdown", "text/csv", ".docx"]) {
      expect(ACCEPT).toContain(token);
    }
    expect(ACCEPT).not.toContain("application/zip");
  });

  it("splits the accept string per surface", () => {
    expect(IMAGE_ACCEPT).toContain("image/png");
    expect(IMAGE_ACCEPT).not.toContain("application/pdf");
    expect(DOCUMENT_ACCEPT).toContain("application/pdf");
    expect(DOCUMENT_ACCEPT).not.toContain("image/png");
  });
});

describe("mediaTypeOf", () => {
  it("prefers the declared type", () => {
    expect(mediaTypeOf({ name: "a.pdf", type: "application/pdf" })).toBe("application/pdf");
    expect(mediaTypeOf({ name: "a.png", type: "image/png;charset=binary" })).toBe("image/png");
  });

  it("falls back to the extension", () => {
    expect(mediaTypeOf({ name: "notes.md", type: "" })).toBe("text/markdown");
    expect(mediaTypeOf({ name: "DATA.CSV", type: "" })).toBe("text/csv");
    expect(mediaTypeOf({ name: "noextension", type: "" })).toBe("");
  });
});

describe("isImageType", () => {
  it("accepts the image types only", () => {
    expect(isImageType("image/jpeg")).toBe(true);
    expect(isImageType("image/webp;charset=binary")).toBe(true);
    expect(isImageType("application/pdf")).toBe(false);
    expect(isImageType("")).toBe(false);
    expect(isImageType({ name: "shot.png", type: "" })).toBe(true);
    expect(isImageType({ name: "shot.heic", type: "image/heic" })).toBe(false);
  });
});

describe("isTextType", () => {
  it("covers the three text documents", () => {
    expect(isTextType("text/plain")).toBe(true);
    expect(isTextType("text/markdown")).toBe(true);
    expect(isTextType("text/csv")).toBe(true);
    expect(isTextType("application/pdf")).toBe(false);
  });
});

describe("validateDeviceFiles", () => {
  it("accepts supported files", () => {
    const result = validateDeviceFiles([makeFile("a.png", "image/png", 12), makeFile("b.pdf", "application/pdf", 12)], 0);
    expect(result.accepted.map((f) => f.name)).toEqual(["a.png", "b.pdf"]);
    expect(result.rejected).toEqual([]);
  });

  it("rejects a wrong type with a readable reason", () => {
    const result = validateDeviceFiles([makeFile("virus.exe", "application/x-msdownload", 12)], 0);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toContain("virus.exe");
    expect(result.rejected[0]).toContain("not a supported type");
  });

  it("rejects a file over the size limit and names its size", () => {
    const result = validateDeviceFiles([makeFile("big.pdf", "application/pdf", MAX_BYTES + 1)], 0);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]).toContain("big.pdf");
    expect(result.rejected[0]).toContain("10.0 MB");
    expect(result.rejected[0]).toContain(`${MAX_MB} MB or smaller`);
  });

  it("stops at the cap and reports how many were dropped", () => {
    const five = Array.from({ length: 5 }, (_, i) => makeFile(`f${i}.png`, "image/png", 4));
    const result = validateDeviceFiles(five, 3);
    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toEqual([`You can attach up to ${MAX_FILES} files. 3 files were not added.`]);
  });

  it("says nothing was added when the composer is already full", () => {
    const result = validateDeviceFiles([makeFile("a.png", "image/png", 4)], MAX_FILES);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toEqual(["You can attach up to 5 files. 1 file was not added."]);
  });

  it("honours a per-surface cap", () => {
    const three = Array.from({ length: 3 }, (_, i) => makeFile(`p${i}.png`, "image/png", 4));
    const result = validateDeviceFiles(three, 0, { max: 2 });
    expect(result.accepted).toHaveLength(2);
    expect(result.rejected[0]).toContain("up to 2 files");
  });

  it("restricts to images or documents when asked", () => {
    const mixed = [makeFile("a.png", "image/png", 4), makeFile("b.pdf", "application/pdf", 4)];
    expect(validateDeviceFiles(mixed, 0, { imagesOnly: true }).accepted.map((f) => f.name)).toEqual(["a.png"]);
    expect(validateDeviceFiles(mixed, 0, { documentsOnly: true }).accepted.map((f) => f.name)).toEqual(["b.pdf"]);
    expect(validateDeviceFiles(mixed, 0, { imagesOnly: true }).rejected[0]).toContain("b.pdf");
    expect(validateDeviceFiles(mixed, 0, { imagesOnly: true }).rejected[0]).not.toContain("PDF, DOCX");
    expect(validateDeviceFiles(mixed, 0, { documentsOnly: true }).rejected[0]).not.toContain("PNG, JPEG");
  });

  it("tolerates empty and missing input", () => {
    for (const input of [null, undefined, [] as File[]]) {
      const result = validateDeviceFiles(input, 0);
      expect(result.accepted).toEqual([]);
      expect(result.rejected).toEqual([]);
    }
  });
});

describe("fileToAttachment", () => {
  it("reads the file into the contract device object", async () => {
    const file = new File(["hello kemma"], "note.txt", { type: "text/plain" });
    const att = await fileToAttachment(file);
    expect(att).toEqual({
      source: "device",
      filename: "note.txt",
      mediaType: "text/plain",
      dataUrl: "data:text/plain;base64,aGVsbG8ga2VtbWE=",
    });
  });

  it("keeps the decoded byte count and the text intact", async () => {
    const text = "unicode check: \u00e9 \u00e8 \u4f60 \u597d";
    const att = await fileToAttachment(new File([text], "u.md", { type: "" }));
    expect(att.mediaType).toBe("text/markdown");
    expect(sizeFromDataUrl(att.dataUrl)).toBe(new TextEncoder().encode(text).length);
    expect(dataUrlToText(att.dataUrl)).toBe(text);
  });

  it("falls back to a binary type when nothing identifies the file", async () => {
    const att = await fileToAttachment(new File(["x"], "blob", { type: "" }));
    expect(att.mediaType).toBe("application/octet-stream");
    expect(att.dataUrl.startsWith("data:application/octet-stream;base64,")).toBe(true);
  });
});

describe("sizeFromDataUrl", () => {
  it("measures padded base64 of every length", () => {
    expect(sizeFromDataUrl("data:image/gif;base64,R0lG")).toBe(3);
    expect(sizeFromDataUrl("data:text/plain;base64,YQ==")).toBe(1);
    expect(sizeFromDataUrl("data:text/plain;base64,YWI=")).toBe(2);
    expect(sizeFromDataUrl("")).toBe(0);
    expect(sizeFromDataUrl("no-comma")).toBe(0);
  });
});

describe("formatBytes", () => {
  it("reads like the rest of the app", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(null)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10.0 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
  });
});

describe("attachment helpers", () => {
  const device = { source: "device", filename: "a.png", mediaType: "image/png", dataUrl: "data:image/png;base64,YQ==" };
  const drive = { source: "drive", fileId: "123", filename: "Plan", mediaType: "application/vnd.google-apps.document" };

  it("names and sizes both sources", () => {
    expect(attachmentName(device)).toBe("a.png");
    expect(attachmentSize(device)).toBe(1);
    expect(attachmentName(drive)).toBe("Plan");
    expect(attachmentSize(drive)).toBe(0);
    expect(attachmentName({ source: "drive", fileId: "123" })).toBe("Google Drive file");
  });

  it("keys Drive by id and device by content", () => {
    expect(attachmentKey(drive, 0)).toBe("drive:123");
    expect(attachmentKey(device, 1)).toBe("device:a.png:1:1");
  });
});


describe("total size cap", () => {
  const big = (name: string, mb: number) => new File([new Uint8Array(mb * 1024 * 1024)], name, { type: "application/pdf" });

  it("refuses a file that would push the request over the total cap", () => {
    const { accepted, rejected } = validateDeviceFiles([big("a.pdf", 9), big("b.pdf", 9), big("c.pdf", 9)], 0);
    expect(accepted.map((f) => f.name)).toEqual(["a.pdf", "b.pdf"]);
    expect(rejected.join(" ")).toMatch(/c\.pdf would take your attachments over 20 MB in total/);
  });

  it("counts what is already attached", () => {
    const { accepted, rejected } = validateDeviceFiles([big("d.pdf", 6)], 1, { attachedBytes: 15 * 1024 * 1024 });
    expect(accepted).toHaveLength(0);
    expect(rejected).toHaveLength(1);
  });

  it("works out a device attachment's decoded size from its data URL", () => {
    const dataUrl = "data:text/plain;base64," + btoa("hello world!!");
    expect(attachmentBytes({ source: "device", dataUrl })).toBe(13);
    expect(attachmentBytes({ source: "drive" })).toBe(0);
  });
});
