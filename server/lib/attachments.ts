/**
 * Attachment validation, download and model context.
 *
 * One shape for every entry point (chat, deep research, document brief, image
 * references), sent by the browser:
 *
 *   { source: "device", filename, mediaType, dataUrl }   a file from the machine
 *   { source: "drive",  fileId, filename?, mediaType? }  a file from Google Drive
 *
 * Device files carry their bytes as a base64 data URL. Drive files are fetched
 * through the signed-in user's own Google connection and Google-native files are
 * exported by this server, never downloaded as native types. Both routes end in
 * the same place: named bytes.
 *
 * A file that cannot be read is reported as a notice and skipped: an attachment
 * never fails the request that carried it. File contents and Google tokens are
 * never logged, and a Drive id that is not the user's own simply fails at Google.
 */

import { z } from "zod";
import { getQuotaSummary } from "../core/quotaCheck";
import type { Tier } from "../core/kemmaRouter";
import { kemmaDocumentScan } from "../kemma/engine";
import {
  downloadDriveFile,
  exportDriveFile,
  getDriveFileMeta,
  getConnectionStatus,
} from "../services/google";
import { bytesToText, splitDataUrl } from "./fnDocument";
import { FnError } from "./fnErrors";

export const MAX_ATTACHMENTS = 5;
export const DEFAULT_ATTACH_MAX_MB = 10;
/** Reference photos for image generation: at most two, and smaller than an attachment. */
export const MAX_REFERENCE_IMAGES = 2;
export const REFERENCE_MAX_MB = 8;
/** Text one attachment contributes, and the ceiling over all attachments in a request. */
export const MAX_FILE_CONTEXT_CHARS = 20000;
export const MAX_TOTAL_CONTEXT_CHARS = 60000;

export const DRIVE_NOT_CONNECTED = "Connect Google on the Connections page first.";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
]);
/** Google-native types: Drive only, and this server exports them before reading. */
const GOOGLE_TYPES = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
]);
const REFERENCE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Export formats tried per native Google type, in order. */
export const DRIVE_EXPORTS: Record<string, { mimeType: string; extension: string }[]> = {
  "application/vnd.google-apps.document": [
    { mimeType: "text/markdown", extension: "md" },
    { mimeType: "application/pdf", extension: "pdf" },
  ],
  "application/vnd.google-apps.spreadsheet": [{ mimeType: "text/csv", extension: "csv" }],
  "application/vnd.google-apps.presentation": [{ mimeType: "application/pdf", extension: "pdf" }],
};

/** Extensions that decide the type when the media type says nothing useful. */
const EXTENSION_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  text: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
};
const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
};

export interface DeviceAttachment {
  source: "device";
  filename: string;
  mediaType: string;
  dataUrl: string;
}

export interface DriveAttachment {
  source: "drive";
  fileId: string;
  filename?: string;
  mediaType?: string;
}

export type Attachment = DeviceAttachment | DriveAttachment;

export interface ResolvedAttachment {
  filename: string;
  mediaType: string;
  bytes: Buffer;
}

export interface AttachmentLimits {
  maxCount: number;
  maxBytes: number;
  imagesOnly: boolean;
}

export interface AttachmentContext {
  text: string;
  notices: string[];
  /** Every attached file name, read or skipped: what a stored message may repeat. */
  names: string[];
}

export interface DescribeImage {
  (file: ResolvedAttachment, userId: number): Promise<string>;
}

const DATA_URL_RE = /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,([\s\S]*)$/i;

const attachmentSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("device"),
    filename: z.string().trim().min(1).max(255),
    mediaType: z.string().trim().max(200).optional(),
    dataUrl: z.string().min(1),
  }),
  z.object({
    source: z.literal("drive"),
    fileId: z.string().trim().min(1).max(200),
    filename: z.string().trim().min(1).max(255).optional(),
    mediaType: z.string().trim().max(200).optional(),
  }),
]);

/** Decoded byte ceiling from ATTACH_MAX_MB, read at call time like every other limit. */
export function attachMaxBytes(): number {
  const raw = Number(process.env.ATTACH_MAX_MB);
  const mb = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ATTACH_MAX_MB;
  return Math.floor(mb * 1024 * 1024);
}

export function attachMaxMb(): number {
  return Math.round((attachMaxBytes() / (1024 * 1024)) * 100) / 100;
}

export function attachmentLimits(): AttachmentLimits {
  return { maxCount: MAX_ATTACHMENTS, maxBytes: attachMaxBytes(), imagesOnly: false };
}

export function referenceLimits(): AttachmentLimits {
  return { maxCount: MAX_REFERENCE_IMAGES, maxBytes: REFERENCE_MAX_MB * 1024 * 1024, imagesOnly: true };
}

/** "image/jpg" and "text/x-markdown" are things browsers really send. */
function normaliseMime(value: string): string {
  const mime = (value || "").split(";")[0].trim().toLowerCase();
  if (mime === "image/jpg") return "image/jpeg";
  if (mime === "text/x-markdown") return "text/markdown";
  return mime;
}

function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return match ? match[1].toLowerCase() : "";
}

/** True for the one data URL form an attachment may use: base64 with a type. */
export function isDataUrl(value: string): boolean {
  return DATA_URL_RE.test((value || "").trim());
}

/**
 * The type this server is willing to read, from the declared media type first and
 * the file name when the media type is missing or says "some binary thing".
 */
export function allowedMediaType(filename: string, mediaType: string, limits: AttachmentLimits): string {
  const declared = normaliseMime(mediaType);
  const fromName = EXTENSION_TYPES[extensionOf(filename)];
  const accepts = (mime: string) => {
    if (limits.imagesOnly) return REFERENCE_IMAGE_TYPES.has(mime);
    return IMAGE_TYPES.has(mime) || DOCUMENT_TYPES.has(mime);
  };
  if (declared && accepts(declared)) return declared;
  // Native Google files are Drive attachments only, and never a reference photo.
  if (declared && GOOGLE_TYPES.has(declared) && !limits.imagesOnly) return declared;
  if (fromName && accepts(fromName)) return fromName;
  return "";
}

/** Whether the type is one this module describes with the vision slot. */
export function isImageType(mediaType: string): boolean {
  return IMAGE_TYPES.has(normaliseMime(mediaType));
}

function isNativeGoogleType(mediaType: string): boolean {
  return GOOGLE_TYPES.has(normaliseMime(mediaType));
}

/** Estimated decoded size of a base64 payload, before spending a decode. */
function base64Bytes(base64: string): number {
  const length = base64.replace(/\s/g, "").length;
  return Math.ceil((length * 3) / 4);
}

function sizeError(label: string, limits: AttachmentLimits): FnError {
  const mb = Math.round((limits.maxBytes / (1024 * 1024)) * 100) / 100;
  return new FnError(413, `${label} is over the ${mb} MB limit.`);
}

/**
 * Validates one attachment list: count, shape, data URL, type and size. Device
 * files must carry a base64 data URL; Drive files must carry a file id.
 */
export function parseAttachments(value: unknown, limits: AttachmentLimits = attachmentLimits()): Attachment[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new FnError(400, "attachments is not valid.");
  if (value.length > limits.maxCount) {
    throw new FnError(400, `Up to ${limits.maxCount} files can be attached to one request.`);
  }
  return value.map((item) => parseAttachment(item, limits));
}

/** The reference-image list of an image generation request: at most two images. */
export function parseReferenceImages(value: unknown): Attachment[] {
  return parseAttachments(value, referenceLimits());
}

export function parseAttachment(value: unknown, limits: AttachmentLimits = attachmentLimits()): Attachment {
  const parsed = attachmentSchema.safeParse(value);
  if (!parsed.success) {
    const label = labelOf(value);
    const issue = parsed.error.issues[0];
    const field = issue?.path?.[0];
    if (field === "dataUrl") throw new FnError(400, `${label} has no file data.`);
    if (field === "fileId") throw new FnError(400, `${label} has no Google Drive file id.`);
    if (field === "filename") throw new FnError(400, "An attachment has no file name.");
    throw new FnError(400, `An attachment is not valid: ${label}.`);
  }

  if (parsed.data.source === "drive") {
    const declared = parsed.data.mediaType ? allowedMediaType(parsed.data.filename ?? "", parsed.data.mediaType, limits) : "";
    if (parsed.data.mediaType && !declared) {
      throw new FnError(400, `That file type cannot be attached: ${parsed.data.mediaType}.`);
    }
    return { source: "drive", fileId: parsed.data.fileId, ...(parsed.data.filename ? { filename: parsed.data.filename } : {}) };
  }

  const device = parsed.data;
  const match = DATA_URL_RE.exec(device.dataUrl.trim());
  if (!match) throw new FnError(400, `${device.filename} is not a base64 data URL.`);
  const mime = allowedMediaType(device.filename, normaliseMime(match[1]) || device.mediaType || "", limits);
  if (!mime) throw new FnError(400, `That file type cannot be attached: ${device.filename}.`);
  if (isNativeGoogleType(mime)) throw new FnError(400, `${device.filename} is a Google-native file: attach it from Drive.`);
  const base64 = match[2].replace(/\s/g, "");
  if (!base64) throw new FnError(400, `${device.filename} is empty.`);
  if (base64Bytes(base64) > limits.maxBytes) throw sizeError(device.filename, limits);

  return { source: "device", filename: device.filename, mediaType: mime, dataUrl: device.dataUrl.trim() };
}

function labelOf(value: unknown): string {
  const filename = (value as { filename?: unknown } | null)?.filename;
  return typeof filename === "string" && filename.trim() ? filename.trim().slice(0, 255) : "attachment";
}

/** One attachment, as a list of one. Used by the document-brief body. */
export function parseAttachmentFrom(value: unknown, limits: AttachmentLimits = attachmentLimits()): Attachment {
  if (!value || typeof value !== "object") throw new FnError(400, "attachment is not valid.");
  return parseAttachment(value, limits);
}

/**
 * Bytes for one attachment: decode a device file, or read the user's own Drive
 * file through their connection. The size limit is checked before a Drive
 * download starts and again on the bytes that arrive.
 */
export async function resolveAttachment(
  userId: number,
  att: Attachment,
  limits: AttachmentLimits = attachmentLimits()
): Promise<ResolvedAttachment> {
  if (att.source === "device") return resolveDeviceAttachment(att, limits);

  const meta = await getDriveFileMeta(userId, att.fileId).catch(() => {
    throw new FnError(404, `${att.filename ?? "The Drive file"} is not available to this Google account.`);
  });
  if (meta.isFolder) throw new FnError(400, `${meta.name} is a folder, not a file.`);

  const mime = allowedMediaType(meta.name, meta.mimeType, limits);
  if (!mime) throw new FnError(400, `That Drive file type cannot be attached: ${meta.mimeType}.`);
  if (meta.size !== undefined && meta.size > limits.maxBytes) throw sizeError(meta.name, limits);

  if (isNativeGoogleType(mime)) {
    const exported = await exportNativeDriveFile(userId, meta.id, meta.name, mime, limits);
    return exported;
  }

  const bytes = await downloadDriveFile(userId, meta.id, limits.maxBytes).catch((err: unknown) => {
    if (err instanceof FnError) throw err;
    throw new FnError(400, `${meta.name} could not be read from Google Drive.`);
  });
  if (bytes.byteLength === 0) throw new FnError(400, `${meta.name} is empty.`);
  if (bytes.byteLength > limits.maxBytes) throw sizeError(meta.name, limits);
  return { filename: withExtension(meta.name, mime), mediaType: mime, bytes };
}

async function resolveDeviceAttachment(att: DeviceAttachment, limits: AttachmentLimits): Promise<ResolvedAttachment> {
  const match = DATA_URL_RE.exec(att.dataUrl);
  if (!match) throw new FnError(400, `${att.filename} is not a base64 data URL.`);
  // splitDataUrl is the same decoder the document brief uses for its uploads.
  const { base64 } = splitDataUrl(att.dataUrl, att.mediaType);
  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength === 0) throw new FnError(400, `${att.filename} is empty.`);
  if (bytes.byteLength > limits.maxBytes) throw sizeError(att.filename, limits);
  const mime = allowedMediaType(att.filename, att.mediaType, limits);
  if (!mime) throw new FnError(400, `That file type cannot be attached: ${att.filename}.`);
  if (isNativeGoogleType(mime)) throw new FnError(400, `${att.filename} is a Google-native file: attach it from Drive.`);
  return { filename: withExtension(att.filename, mime), mediaType: mime, bytes };
}

/**
 * Native Google files have no downloadable bytes: ask Drive for the export format
 * that reads best, and fall back to the next one if Google refuses it.
 */
async function exportNativeDriveFile(
  userId: number,
  fileId: string,
  name: string,
  nativeType: string,
  limits: AttachmentLimits
): Promise<ResolvedAttachment> {
  const candidates = DRIVE_EXPORTS[nativeType] ?? [];
  let tooLarge: FnError | null = null;
  for (const candidate of candidates) {
    const bytes = await exportDriveFile(userId, fileId, candidate.mimeType, limits.maxBytes).catch((err: unknown) => {
      if (err instanceof FnError) throw err;
      return null;
    });
    if (!bytes) continue;
    if (bytes.byteLength > limits.maxBytes) {
      tooLarge = sizeError(name, limits);
      continue;
    }
    if (bytes.byteLength === 0) throw new FnError(400, `${name} has no readable content.`);
    return { filename: `${stripExtension(name)}.${candidate.extension}`, mediaType: candidate.mimeType, bytes };
  }
  if (tooLarge) throw tooLarge;
  throw new FnError(400, `${name} could not be exported from Google Drive.`);
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[a-z0-9]+$/i, "").trim() || filename;
}

/** A name the model and the file readers can both classify: "notes" plus ".md". */
function withExtension(filename: string, mediaType: string): string {
  if (extensionOf(filename) || !EXTENSION_BY_TYPE[mediaType]) return filename;
  return `${filename}.${EXTENSION_BY_TYPE[mediaType]}`;
}

/** Drive access needs the user's own connection; a missing one is the client's to fix. */
export async function requireDriveConnection(userId: number): Promise<void> {
  const status = await getConnectionStatus(userId);
  if (!status.connected) throw new FnError(409, DRIVE_NOT_CONNECTED);
}

export function hasDriveAttachment(atts: Attachment[]): boolean {
  return atts.some((att) => att.source === "drive");
}

const IMAGE_PROMPT =
  "Describe this image in a short paragraph: the subject, the setting, and what is happening. Then transcribe every piece of text visible in it, in reading order. Plain text only, with no commentary.";

/** Vision-slot description of an image: what it shows plus the text inside it. */
export const describeImageWithVision: DescribeImage = async (file, userId) => {
  const quota = await getQuotaSummary(userId);
  const scan = await kemmaDocumentScan({
    userId,
    tier: quota.tier,
    imageData: file.bytes.toString("base64"),
    mimeType: file.mediaType,
    prompt: IMAGE_PROMPT,
  });
  const text = (scan.text ?? "").trim();
  if (!text) throw new FnError(422, "Nothing could be read from that image.");
  return text;
};

/**
 * The readable text of one attachment, uncapped: extracted for a document,
 * described for an image. The document brief reads a single file with this.
 */
export async function attachmentBody(
  userId: number,
  att: Attachment,
  limits: AttachmentLimits = attachmentLimits(),
  describe: DescribeImage = describeImageWithVision
): Promise<ResolvedAttachment & { text: string }> {
  const file = await resolveAttachment(userId, att, limits);
  const text = isImageType(file.mediaType)
    ? await describe(file, userId)
    : await bytesToText({ filename: file.filename, mediaType: file.mediaType }, file.bytes, userId);
  return { ...file, text };
}

/**
 * Everything attached, as one context block for the model. A file that fails is
 * named in `notices` and the rest still goes through. `maxTotalChars` lets a
 * caller that has already spent part of the budget (deep research) share it.
 */
export async function attachmentsToContext(
  userId: number,
  atts: Attachment[],
  options: { maxTotalChars?: number; describe?: DescribeImage; limits?: AttachmentLimits } = {}
): Promise<AttachmentContext> {
  const notices: string[] = [];
  const names: string[] = [];
  if (atts.length === 0) return { text: "", notices, names };

  const describe = options.describe ?? describeImageWithVision;
  const limits = options.limits ?? attachmentLimits();
  const maxTotal = Math.max(0, options.maxTotalChars ?? MAX_TOTAL_CONTEXT_CHARS);
  const blocks: string[] = [];
  let used = 0;

  for (const att of atts) {
    const label = att.filename || (att.source === "drive" ? "Drive file" : "attachment");
    names.push(label);
    if (used >= maxTotal) {
      notices.push(`Skipped ${label}: the attachment budget is full.`);
      continue;
    }
    try {
      const body = await attachmentBody(userId, att, limits, describe);
      const text = body.text.trim();
      if (!text) {
        notices.push(`Skipped ${label}: no readable text.`);
        continue;
      }
      const room = Math.min(MAX_FILE_CONTEXT_CHARS, maxTotal - used);
      const slice = text.slice(0, room);
      used += slice.length;
      const heading = isImageType(body.mediaType) ? "Image" : "File";
      blocks.push(`${heading}: ${body.filename}\n${slice}`);
    } catch (err) {
      notices.push(`Skipped ${label}: ${err instanceof FnError ? err.message : "it could not be read."}`);
    }
  }

  if (blocks.length === 0) return { text: "", notices, names };
  return { text: `ATTACHMENTS PROVIDED BY THE USER, use them as sources:\n\n${blocks.join("\n\n---\n\n")}`, notices, names };
}

/** The line a stored user message carries when files came with it: names only. */
export function attachmentNote(names: string[]): string {
  if (names.length === 0) return "";
  return `Attached files: ${names.join(", ")}`;
}

/**
 * Appends a context block to the last user message, on a copy: the array the
 * client sent is never touched, so persistence keeps the original text.
 */
export function withContextOnLastUserMessage<T extends { role: string; content?: string | null }>(
  messages: T[],
  context: string
): T[] {
  if (!context) return messages;
  const out = [...messages];
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === "user") {
      out[i] = { ...out[i], content: `${out[i].content ?? ""}\n\n${context}` };
      break;
    }
  }
  return out;
}
