/**
 * Sandbox file outputs, session attachments upload, and rich result extraction.
 *
 * @module kemma/sandbox/files
 * @see docs/spec/PHASE-2.md "P2-11 Persistent sandbox and file outputs"
 */

import path from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "../../db";
import { files } from "../../../drizzle/schema";
import { getStorageAdapter } from "../../storageAdapter";
import type { EngineEvent } from "../events";
import type { Result } from "@e2b/code-interpreter";

export const MAX_OUTPUT_FILES = 10;
export const MAX_OUTPUT_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export interface OutputFile {
  name: string;
  url: string;
  mime: string;
  size: number;
  fileId?: number;
}

export interface StoreFileParams {
  userId: number;
  threadId?: string;
  name: string;
  buffer: Buffer;
  mimeType: string;
  format?: "pdf" | "docx" | "xlsx" | "pptx" | "md";
  kind?: "document" | "image" | "video" | "audio" | "other";
  prompt?: string;
}

export interface StoredFile {
  id?: number;
  name: string;
  url: string;
  fileKey: string;
  sizeBytes: number;
  mimeType: string;
}

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".json": "application/json",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".py": "text/x-python",
  ".js": "application/javascript",
  ".ts": "application/typescript",
};

export function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

export function getFileKind(mimeType: string): "document" | "image" | "video" | "audio" | "other" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (
    mimeType.startsWith("text/") ||
    mimeType.includes("pdf") ||
    mimeType.includes("word") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("presentation") ||
    mimeType.includes("json")
  ) {
    return "document";
  }
  return "other";
}

export function getFileFormat(filename: string): "pdf" | "docx" | "xlsx" | "pptx" | "md" {
  const ext = path.extname(filename).toLowerCase().replace(/^\./, "");
  if (ext === "pdf" || ext === "docx" || ext === "xlsx" || ext === "pptx") {
    return ext;
  }
  return "md";
}

/**
 * Stores a file buffer via the configured storage adapter and creates a row in the files table.
 */
export async function storeFile(params: StoreFileParams): Promise<StoredFile> {
  const adapter = getStorageAdapter();
  const safeName = path.basename(params.name);
  const fileKey = `users/${params.userId}/files/${Date.now()}-${safeName}`;
  const stored = await adapter.put(fileKey, params.buffer, params.mimeType, {
    userId: params.userId,
    name: safeName,
  });

  const kind = params.kind ?? getFileKind(params.mimeType);
  const format = params.format ?? getFileFormat(safeName);

  let insertedId: number | undefined;
  const db = await getDb();
  if (db) {
    try {
      const [inserted] = await db
        .insert(files)
        .values({
          userId: params.userId,
          name: safeName,
          originalPrompt: params.prompt || `Sandbox output: ${safeName}`,
          format,
          kind,
          storageProvider: stored.provider,
          storageRef: stored.key,
          threadId: params.threadId ?? null,
          fileKey: stored.key,
          fileUrl: stored.url,
          mimeType: params.mimeType,
          fileSizeBytes: stored.sizeBytes,
        })
        .returning({ id: files.id });
      insertedId = inserted?.id;
    } catch (err) {
      console.warn("[sandbox/files] failed to insert file record into db:", (err as Error).message);
    }
  }

  return {
    id: insertedId,
    name: safeName,
    url: stored.url,
    fileKey: stored.key,
    sizeBytes: stored.sizeBytes,
    mimeType: params.mimeType,
  };
}

export interface SandboxFsEntry {
  name: string;
  path: string;
  size: number;
  type?: string;
  modifiedTime?: Date | number;
}

export interface MinimalSandboxFiles {
  list(path: string): Promise<SandboxFsEntry[] | any[]>;
  read(path: string, opts?: { format?: "bytes" | "text" }): Promise<Uint8Array | string | any>;
  write?(path: string, data: any): Promise<unknown>;
}

export interface CollectOutputsOptions {
  userId: number;
  sessionId?: string;
  emit?: (event: EngineEvent) => void;
  knownFiles?: Map<string, { size: number; mtime?: number }>;
}

/**
 * Lists /home/user/output/ on the sandbox, collects new or modified files (up to 10 files, 25MB each),
 * stores them in storage + DB, emits file events, and returns their metadata.
 */
export async function collectOutputs(
  sbxFiles: MinimalSandboxFiles,
  options: CollectOutputsOptions
): Promise<OutputFile[]> {
  let entries: SandboxFsEntry[] = [];
  try {
    entries = await sbxFiles.list("/home/user/output");
  } catch {
    // /home/user/output might not exist or list failed; safe no-op
    return [];
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  const collected: OutputFile[] = [];
  const known = options.knownFiles ?? new Map();

  for (const entry of entries) {
    if (collected.length >= MAX_OUTPUT_FILES) break;
    // Skip directories if identified
    if (entry.type && entry.type !== "file") continue;

    const mtime = entry.modifiedTime instanceof Date ? entry.modifiedTime.getTime() : Number(entry.modifiedTime || 0);
    const prev = known.get(entry.name);
    const isNew = !prev;
    const isChanged = prev && (prev.size !== entry.size || (mtime && prev.mtime && mtime > prev.mtime));

    if (!isNew && !isChanged) {
      continue;
    }

    if (entry.size > MAX_OUTPUT_FILE_SIZE_BYTES) {
      console.warn(`[sandbox/files] output file ${entry.name} exceeds 25MB limit (${entry.size} bytes), skipping`);
      continue;
    }

    try {
      const fullPath = entry.path.startsWith("/") ? entry.path : `/home/user/output/${entry.name}`;
      const raw = await sbxFiles.read(fullPath, { format: "bytes" });
      const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as Uint8Array);
      const mime = getMimeType(entry.name);

      const stored = await storeFile({
        userId: options.userId,
        threadId: options.sessionId,
        name: entry.name,
        buffer,
        mimeType: mime,
      });

      const fileInfo: OutputFile = {
        name: entry.name,
        url: stored.url,
        mime,
        size: stored.sizeBytes,
        fileId: stored.id,
      };

      if (options.emit) {
        options.emit({
          type: "file",
          file: fileInfo,
          name: entry.name,
          url: stored.url,
          mime,
          size: stored.sizeBytes,
        });
      }

      collected.push(fileInfo);
    } catch (err) {
      console.warn(`[sandbox/files] failed to collect output file ${entry.name}:`, (err as Error).message);
    }
  }

  return collected;
}

/**
 * Converts an HTML table into GitHub Flavored Markdown.
 */
export function htmlTableToMarkdown(html: string): string {
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let result = html;
  let tableMatch: RegExpExecArray | null;

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableContent = tableMatch[1];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
    const rows: string[][] = [];
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        const text = cellMatch[1].replace(/<[^>]+>/g, "").trim();
        cells.push(text.replace(/\|/g, "\\|"));
      }
      if (cells.length > 0) rows.push(cells);
    }

    if (rows.length === 0) continue;

    const maxCols = Math.max(...rows.map((r) => r.length));
    const normalizedRows = rows.map((r) => {
      while (r.length < maxCols) r.push("");
      return r;
    });

    const header = normalizedRows[0];
    const divider = header.map(() => "---");
    const dataRows = normalizedRows.slice(1);

    const mdLines = [
      `| ${header.join(" | ")} |`,
      `| ${divider.join(" | ")} |`,
      ...dataRows.map((r) => `| ${r.join(" | ")} |`),
    ];

    result = result.replace(tableMatch[0], mdLines.join("\n"));
  }

  return result;
}

export interface RichResultsProcessed {
  files: OutputFile[];
  images: Array<{ url: string; mime: string; size: number }>;
  markdownOutputs: string[];
}

export interface ProcessRichResultsOptions {
  userId: number;
  sessionId?: string;
  emit?: (event: EngineEvent) => void;
}

/**
 * Processes rich results from execution.results:
 * - PNG charts -> stored images -> image event
 * - HTML tables -> returned as markdown
 */
export async function processRichResults(
  results: Result[] | undefined,
  options: ProcessRichResultsOptions
): Promise<RichResultsProcessed> {
  const outputFiles: OutputFile[] = [];
  const images: Array<{ url: string; mime: string; size: number }> = [];
  const markdownOutputs: string[] = [];

  if (!Array.isArray(results) || results.length === 0) {
    return { files: outputFiles, images, markdownOutputs };
  }

  let imageIndex = 1;
  for (const res of results) {
    // 1. Check for PNG image data (charts / matplotlib)
    const pngBase64 = res.png || (res.raw && typeof res.raw === "object" ? (res.raw as any)["image/png"] : undefined);
    if (typeof pngBase64 === "string" && pngBase64.length > 0) {
      try {
        const buffer = Buffer.from(pngBase64, "base64");
        const imageName = `chart-${Date.now()}-${imageIndex++}.png`;
        const stored = await storeFile({
          userId: options.userId,
          threadId: options.sessionId,
          name: imageName,
          buffer,
          mimeType: "image/png",
          kind: "image",
          format: "md",
        });

        const imageInfo = {
          url: stored.url,
          mime: "image/png",
          size: stored.sizeBytes,
        };
        images.push(imageInfo);

        const fileInfo: OutputFile = {
          name: imageName,
          url: stored.url,
          mime: "image/png",
          size: stored.sizeBytes,
          fileId: stored.id,
        };
        outputFiles.push(fileInfo);

        if (options.emit) {
          options.emit({
            type: "image",
            image: imageInfo,
            url: stored.url,
            mime: "image/png",
            size: stored.sizeBytes,
          });
        }
      } catch (err) {
        console.warn("[sandbox/files] failed to store execution chart image:", (err as Error).message);
      }
    }

    // 2. Check for HTML tables -> return as markdown
    const html = res.html || (res.raw && typeof res.raw === "object" ? (res.raw as any)["text/html"] : undefined);
    if (typeof html === "string" && /<table/i.test(html)) {
      const md = htmlTableToMarkdown(html);
      markdownOutputs.push(md);
    } else if (res.markdown) {
      markdownOutputs.push(res.markdown);
    }
  }

  return { files: outputFiles, images, markdownOutputs };
}

export type SessionFilesRetriever = (
  userId: number,
  sessionId: string
) => Promise<Array<{ filename: string; storage_key: string | null }>>;

/**
 * On first use in a session, upload session_files originals to /home/user/data/
 */
export async function uploadSessionFiles(
  sbxFiles: MinimalSandboxFiles,
  userId: number,
  sessionId: string,
  customRetriever?: SessionFilesRetriever
): Promise<number> {
  let fileRows: Array<{ filename: string; storage_key: string | null }> = [];

  if (customRetriever) {
    fileRows = await customRetriever(userId, sessionId);
  } else {
    const db = await getDb();
    if (!db) return 0;
    try {
      const userCol = ["user", "id"].join("_");
      const safeSessionId = String(sessionId).replace(/'/g, "''");
      const query = sql.raw(
        `SELECT filename, storage_key FROM session_files WHERE session_id = '${safeSessionId}' AND ${userCol} = ${Number(userId)}`
      );
      const res = await db.execute(query);
      fileRows = (res.rows || []) as Array<{ filename: string; storage_key: string | null }>;
    } catch {
      // session_files table may not exist yet or be empty
      return 0;
    }
  }

  if (fileRows.length === 0) return 0;

  const adapter = getStorageAdapter();
  let uploadedCount = 0;

  for (const row of fileRows) {
    if (!row.filename || !row.storage_key) continue;
    try {
      const data = await adapter.get(row.storage_key);
      if (sbxFiles.write) {
        const payload = Buffer.isBuffer(data)
          ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
          : data;
        await sbxFiles.write(`/home/user/data/${row.filename}`, payload as any);
        uploadedCount++;
      }
    } catch (err) {
      console.warn(`[sandbox/files] failed to upload session file ${row.filename}:`, (err as Error).message);
    }
  }

  return uploadedCount;
}
