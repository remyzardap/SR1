import { generateFile } from "../../fileGenerator";
import { getStorageAdapter } from "../../storageAdapter";
import { getDb } from "../../db";
import { files } from "../../../drizzle/schema";
import type { StructuredContent, StyleOption, FileFormat } from "../../fileGenerator";

const SUPPORTED_FORMATS: readonly string[] = ["pdf", "docx", "xlsx", "pptx", "md"];

/**
 * Generates a file, stores bytes via the configured adapter, and persists
 * metadata to the database.
 */
export async function generateAndSaveFile(
  userId: number,
  name: string,
  content: StructuredContent,
  format: string,
  style: StyleOption,
  options?: { threadId?: string; spaceId?: string }
): Promise<{ url: string; fileId: number; name: string }> {
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw new Error(`Unsupported file format: ${format}`);
  }
  const fmt = format as FileFormat;
  const { buffer, extension, mimeType } = await generateFile(content, fmt, style);

  const adapter = getStorageAdapter();
  const fileKey = `users/${userId}/files/${name}.${extension}`;
  const stored = await adapter.put(fileKey, buffer, mimeType, { userId, spaceId: options?.spaceId });

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [insertedFile] = await db
    .insert(files)
    .values({
      userId,
      name,
      originalPrompt: content.title || name,
      format: fmt,
      styleLabel: style.label ?? null,
      kind: "document",
      storageProvider: stored.provider,
      storageRef: stored.key,
      threadId: options?.threadId ?? null,
      spaceId: options?.spaceId ?? null,
      fileKey: stored.key,
      fileUrl: stored.url,
      mimeType,
      fileSizeBytes: stored.sizeBytes,
    })
    .returning({ id: files.id });

  if (!insertedFile) {
    throw new Error("Failed to insert file record into database");
  }

  return {
    url: stored.url,
    fileId: insertedFile.id,
    name,
  };
}
