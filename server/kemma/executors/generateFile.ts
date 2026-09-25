import { generateFile } from "../../fileGenerator";
import { storagePut } from "../../storage";
import { getDb } from "../../db";
import { files } from "../../../drizzle/schema";
import type { StructuredContent, StyleOption } from "../../fileGenerator";

/**
 * Generates a file, uploads it to S3, and persists metadata to the database.
 *
 * @param userId - The ID of the user requesting the file generation
 * @param name - The base name for the file (without extension)
 * @param content - The document content to generate from
 * @param format - The output format (e.g., 'pdf', 'docx')
 * @param style - The styling definition for the output
 * @returns Object containing the file URL, database ID, and name
 * @throws Error if file generation, upload, or database insertion fails
 */
export async function generateAndSaveFile(
  userId: number,
  name: string,
  content: StructuredContent,
  format: string,
  style: StyleOption
): Promise<{ url: string; fileId: number; name: string }> {
  // Step 1: Generate the file content
  const fmt = format as "pdf" | "docx" | "xlsx" | "pptx" | "md";
  const { buffer, extension, mimeType } = await generateFile(content, fmt, style);

  // Step 2: Construct the S3 file key path
  const fileKey = `users/${userId}/files/${name}.${extension}`;

  // Step 3: Upload to S3 storage
  const { url } = await storagePut(fileKey, buffer, mimeType);

  // Step 4: Insert record into the database
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
      fileKey,
      fileUrl: url,
      mimeType,
      fileSizeBytes: buffer.length,
    })
    .returning({ id: files.id });

  if (!insertedFile) {
    throw new Error("Failed to insert file record into database");
  }

  // Step 5: Return the result
  return {
    url,
    fileId: insertedFile.id,
    name,
  };
}
