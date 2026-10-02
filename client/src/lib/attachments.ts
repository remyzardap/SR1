/*
 * Attachments: the shared shape the browser sends with a prompt, plus the pure
 * helpers around it (validation, reading a File, size formatting). The server
 * reads the same shape on /api/kemma/stream, /api/fn/research, /api/fn/document-brief
 * and /api/fn/image, so nothing here may drift from the contract below.
 */

/** A file read in the browser and sent inline as a data URL. */
export interface DeviceAttachment {
  source: "device";
  filename: string;
  mediaType: string;
  dataUrl: string;
}

/** A Google Drive file reference; the server fetches or exports it by id. */
export interface DriveAttachment {
  source: "drive";
  fileId: string;
  filename?: string;
  mediaType?: string;
}

export type Attachment = DeviceAttachment | DriveAttachment;

export const MAX_FILES = 5;
/** Mirrors the server default for ATTACH_MAX_MB; there is no endpoint that reports the limit. */
export const MAX_MB = 10;
export const MAX_BYTES = MAX_MB * 1024 * 1024;

/** Types the server accepts for both sources. Google native files are Drive only and exported there. */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const DOCUMENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
] as const;

/** Extensions some browsers report instead of a usable MIME type. */
const EXT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
};

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
const DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".txt", ".md", ".markdown", ".csv"];

const join = (types: readonly string[], extensions: string[]) => [...types, ...extensions].join(",");

/** Everything the user may attach from this device. */
export const ACCEPT = join([...IMAGE_TYPES, ...DOCUMENT_TYPES], [...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS]);
/** Photos only (the Images page). */
export const IMAGE_ACCEPT = join(IMAGE_TYPES, IMAGE_EXTENSIONS);
/** Documents only (the document brief). */
export const DOCUMENT_ACCEPT = join(DOCUMENT_TYPES, DOCUMENT_EXTENSIONS);

const TEXT_TYPES: readonly string[] = ["text/plain", "text/markdown", "text/csv"];

/** Normalised MIME type of a file, falling back to its extension. */
export function mediaTypeOf(file: { name?: string; type?: string }): string {
  const declared = (file.type || "").split(";")[0].trim().toLowerCase();
  if (declared) return declared;
  const parts = (file.name || "").toLowerCase().split(".");
  const ext = parts.length > 1 ? parts[parts.length - 1] : "";
  return EXT_TYPES[ext] || "";
}

/** True for the image types the contract allows. Accepts a MIME type or a file-like object. */
export function isImageType(value: string | { name?: string; type?: string }): boolean {
  const type = typeof value === "string" ? value : mediaTypeOf(value);
  return (IMAGE_TYPES as readonly string[]).includes((type || "").split(";")[0].trim().toLowerCase());
}

export interface DeviceValidation {
  accepted: File[];
  /** Human readable reasons, one per problem, ready to show inline. */
  rejected: string[];
}

export interface ValidateOptions {
  /** Total cap for this composer, not the number still to add. Defaults to MAX_FILES. */
  max?: number;
  imagesOnly?: boolean;
  documentsOnly?: boolean;
}

/**
 * Split picked files into what we can attach and what we must refuse.
 * `alreadyAttached` is how many attachments the composer already holds.
 */
export function validateDeviceFiles(
  files: File[] | FileList | null | undefined,
  alreadyAttached = 0,
  options: ValidateOptions = {},
): DeviceValidation {
  const incoming = files ? (Array.isArray(files) ? files : Array.from(files)) : [];
  const max = options.max ?? MAX_FILES;
  const allowed: readonly string[] = options.imagesOnly
    ? IMAGE_TYPES
    : options.documentsOnly
      ? DOCUMENT_TYPES
      : [...IMAGE_TYPES, ...DOCUMENT_TYPES];
  const hint = options.imagesOnly
    ? "Use photos (PNG, JPEG, WebP, GIF)."
    : options.documentsOnly
      ? "Use documents (PDF, DOCX, TXT, MD, CSV)."
      : "Use photos (PNG, JPEG, WebP, GIF) or documents (PDF, DOCX, TXT, MD, CSV).";

  const accepted: File[] = [];
  const kept: File[] = [];
  const rejected: string[] = [];

  for (const file of incoming) {
    const name = file.name || "That file";
    const type = mediaTypeOf(file);
    if (!type || !allowed.includes(type)) {
      rejected.push(`${name} is not a supported type. ${hint}`);
      continue;
    }
    if (file.size > MAX_BYTES) {
      rejected.push(`${name} is ${formatBytes(file.size)}. Each attachment must be ${MAX_MB} MB or smaller.`);
      continue;
    }
    kept.push(file);
  }

  const room = Math.max(0, max - alreadyAttached);
  accepted.push(...kept.slice(0, room));
  const dropped = kept.length - accepted.length;
  if (dropped > 0) {
    rejected.push(`You can attach up to ${max} files. ${dropped} ${dropped === 1 ? "file was" : "files were"} not added.`);
  }

  return { accepted, rejected };
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Read a device file into the contract's device attachment. */
export async function fileToAttachment(file: File): Promise<DeviceAttachment> {
  const mediaType = mediaTypeOf(file) || "application/octet-stream";
  const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  return {
    source: "device",
    filename: file.name || "attachment",
    mediaType,
    dataUrl: `data:${mediaType};base64,${base64}`,
  };
}

/** Decoded byte count of a data URL, used to show the size of a device attachment. */
export function sizeFromDataUrl(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const body = dataUrl.slice(comma + 1);
  if (!body) return 0;
  const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((body.length * 3) / 4) - padding);
}

/** Decode a data URL back to text. Used for txt and md files in the document brief. */
export function dataUrlToText(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return "";
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** True when the server can be given this document as plain text instead of bytes. */
export function isTextType(mediaType: string): boolean {
  return TEXT_TYPES.includes((mediaType || "").split(";")[0].trim().toLowerCase());
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** Display name of an attachment, whatever its source. */
export function attachmentName(att: Attachment): string {
  return att.filename || (att.source === "drive" ? "Google Drive file" : "attachment");
}

/** Device attachments carry their bytes inline, Drive attachments carry an id. */
export function attachmentSize(att: Attachment): number {
  return att.source === "device" ? sizeFromDataUrl(att.dataUrl) : 0;
}

/** Stable key for chips and lists. */
export function attachmentKey(att: Attachment, index: number): string {
  if (att.source === "drive") return `drive:${att.fileId}`;
  return `device:${att.filename}:${attachmentSize(att)}:${index}`;
}
