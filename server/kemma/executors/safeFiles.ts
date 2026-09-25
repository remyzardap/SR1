/**
 * File Operations Executor
 * Handles CRUD operations, versioning, trash, and purge functionality
 */

import bcrypt from 'bcryptjs';
import { eq, and, isNull } from 'drizzle-orm';
import { storagePut, storageGet } from '../../storage';
import { getDb } from '../../db';
import { files, userQuotas } from '../../../drizzle/schema';

// ============================================================================
// Types
// ============================================================================

export interface CreateFileResult {
  fileId: number;
  url: string;
}

export interface FileRecord {
  id: number;
  userId: number;
  name: string;
  originalPrompt: string;
  format: "pdf" | "docx" | "xlsx" | "pptx" | "md";
  styleLabel: string | null;
  fileKey: string;
  fileUrl: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  trashed: boolean | null;
  trashedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface FileVersion {
  timestamp: string;
  key: string;
}

// ============================================================================
// Error Classes
// ============================================================================

export class FileOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileOperationError';
  }
}

export class FileNotFoundError extends FileOperationError {
  constructor(fileId: number) {
    super(`File with ID ${fileId} not found`);
    this.name = 'FileNotFoundError';
  }
}

export class UnauthorizedError extends FileOperationError {
  constructor(message: string = 'Unauthorized access to file') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class PurgePasswordError extends FileOperationError {
  constructor() {
    super('Invalid purge password');
    this.name = 'PurgePasswordError';
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build S3 path for active files
 */
function buildFilePath(userId: number, path: string): string {
  return `users/${userId}/files/${path}`;
}

/**
 * Build S3 path for archive versions
 */
function buildArchivePath(userId: number, fileId: number, timestamp: string): string {
  return `users/${userId}/archive/${fileId}/${timestamp}`;
}

/**
 * Build S3 path for trash
 */
function buildTrashPath(userId: number, path: string): string {
  return `users/${userId}/to_be_deleted/${path}`;
}

/**
 * Get current timestamp for versioning
 */
function getTimestamp(): string {
  return Date.now().toString();
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Create a new file
 * @param userId - The user ID
 * @param path - The file path (relative to user's files directory)
 * @param content - The file content as Buffer
 * @param mimeType - The MIME type of the file
 * @returns Object containing fileId and URL
 */
export async function createFile(
  userId: number,
  path: string,
  content: Buffer,
  mimeType: string
): Promise<CreateFileResult> {
  const db = await getDb();
  if (!db) throw new FileOperationError('Database not available');
  const fileKey = buildFilePath(userId, path);

  try {
    // Upload to S3
    const { url } = await storagePut(fileKey, content, mimeType);

    // Insert record into database
    const name = path.split('/').pop() || path;
    const [result] = await db
      .insert(files)
      .values({
        userId,
        name,
        originalPrompt: name,
        format: "md",
        styleLabel: null,
        fileKey,
        fileUrl: url,
        mimeType,
        fileSizeBytes: content.length,
        trashed: false,
        trashedAt: null,
      })
      .returning({ id: files.id });

    if (!result) throw new FileOperationError('Failed to insert file record');
    const fileId = result.id;

    return { fileId, url };
  } catch (error) {
    throw new FileOperationError(
      `Failed to create file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Read a file's content
 * @param userId - The user ID
 * @param fileId - The file ID
 * @returns The file content as Buffer
 */
export async function readFile(userId: number, fileId: number): Promise<Buffer> {
  const db = await getDb();
  if (!db) throw new FileOperationError('Database not available');

  try {
    // Get file record from database
    const fileRecords = await db
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.userId, userId)))
      .limit(1);

    if (fileRecords.length === 0) {
      throw new FileNotFoundError(fileId);
    }

    const fileRecord = fileRecords[0];

    // Fetch content from S3
    const content = await storageGet(fileRecord.fileKey);

    return content;
  } catch (error) {
    if (error instanceof FileNotFoundError) {
      throw error;
    }
    throw new FileOperationError(
      `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Edit an existing file (with versioning)
 * @param userId - The user ID
 * @param fileId - The file ID
 * @param newContent - The new file content as Buffer
 */
export async function editFile(
  userId: number,
  fileId: number,
  newContent: Buffer
): Promise<void> {
  const db = await getDb();
  if (!db) throw new FileOperationError('Database not available');

  try {
    // Get current file record
    const fileRecords = await db
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.userId, userId)))
      .limit(1);

    if (fileRecords.length === 0) {
      throw new FileNotFoundError(fileId);
    }

    const fileRecord = fileRecords[0];

    // Get current content for archiving
    const currentContent = await storageGet(fileRecord.fileKey);

    // Archive old version
    const timestamp = getTimestamp();
    const archiveKey = buildArchivePath(userId, fileId, timestamp);
    await storagePut(archiveKey, currentContent, fileRecord.mimeType ?? undefined);

    // Upload new content to original path
    const { url: newUrl } = await storagePut(
      fileRecord.fileKey,
      newContent,
      fileRecord.mimeType ?? undefined
    );

    // Update database record
    await db
      .update(files)
      .set({
        fileUrl: newUrl,
        fileSizeBytes: newContent.length,
      })
      .where(eq(files.id, fileId));
  } catch (error) {
    if (error instanceof FileNotFoundError) {
      throw error;
    }
    throw new FileOperationError(
      `Failed to edit file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * List all active (non-trashed) files for a user
 * @param userId - The user ID
 * @returns Array of file records
 */
export async function listFiles(userId: number): Promise<FileRecord[]> {
  const db = await getDb();
  if (!db) throw new FileOperationError('Database not available');

  try {
    const fileRecords = await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.userId, userId),
          // trashed is false or null
          // Using isNull check for trashed field
        )
      );

    // Filter out trashed files (trashed = true)
    return fileRecords.filter(
      (file) => file.trashed !== true
    ) as FileRecord[];
  } catch (error) {
    throw new FileOperationError(
      `Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Move a file to trash
 * @param userId - The user ID
 * @param fileId - The file ID
 */
export async function trashFile(userId: number, fileId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new FileOperationError('Database not available');

  try {
    // Get file record
    const fileRecords = await db
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.userId, userId)))
      .limit(1);

    if (fileRecords.length === 0) {
      throw new FileNotFoundError(fileId);
    }

    const fileRecord = fileRecords[0];

    // Get current content
    const content = await storageGet(fileRecord.fileKey);

    // Copy to trash location
    const trashKey = buildTrashPath(userId, fileRecord.fileKey.replace(`users/${userId}/files/`, ''));
    await storagePut(trashKey, content, fileRecord.mimeType ?? undefined);

    // Mark as trashed in database
    await db
      .update(files)
      .set({
        trashed: true,
        trashedAt: new Date(),
      })
      .where(eq(files.id, fileId));
  } catch (error) {
    if (error instanceof FileNotFoundError) {
      throw error;
    }
    throw new FileOperationError(
      `Failed to trash file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Restore a file from trash
 * @param userId - The user ID
 * @param fileId - The file ID
 */
export async function restoreFile(userId: number, fileId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new FileOperationError('Database not available');

  try {
    // Get file record
    const fileRecords = await db
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.userId, userId)))
      .limit(1);

    if (fileRecords.length === 0) {
      throw new FileNotFoundError(fileId);
    }

    const fileRecord = fileRecords[0];

    // Check if file is actually trashed
    if (!fileRecord.trashed) {
      throw new FileOperationError('File is not in trash');
    }

    // Get content from trash
    const trashKey = buildTrashPath(userId, fileRecord.fileKey.replace(`users/${userId}/files/`, ''));
    const content = await storageGet(trashKey);

    // Copy back to original location
    await storagePut(fileRecord.fileKey, content, fileRecord.mimeType ?? undefined);

    // Clear trashed flag
    await db
      .update(files)
      .set({
        trashed: false,
        trashedAt: null,
      })
      .where(eq(files.id, fileId));
  } catch (error) {
    if (error instanceof FileNotFoundError || error instanceof FileOperationError) {
      throw error;
    }
    throw new FileOperationError(
      `Failed to restore file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Permanently delete a file (requires purge password verification)
 * @param userId - The user ID
 * @param fileId - The file ID
 * @param password - The purge password for verification
 */
export async function purgeFile(
  userId: number,
  fileId: number,
  password: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new FileOperationError('Database not available');

  try {
    // Get purge password hash from userQuotas
    const quotaRecords = await db
      .select()
      .from(userQuotas)
      .where(eq(userQuotas.userId, userId))
      .limit(1);

    if (quotaRecords.length === 0) {
      throw new FileOperationError('User quota record not found');
    }

    const { purgePasswordHash } = quotaRecords[0];

    if (!purgePasswordHash) {
      throw new FileOperationError('Purge password not configured');
    }

    // Verify password using bcrypt
    const isValid = await bcrypt.compare(password, purgePasswordHash);

    if (!isValid) {
      throw new PurgePasswordError();
    }

    // Get file record
    const fileRecords = await db
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.userId, userId)))
      .limit(1);

    if (fileRecords.length === 0) {
      throw new FileNotFoundError(fileId);
    }

    const fileRecord = fileRecords[0];

    // Delete from database
    await db.delete(files).where(eq(files.id, fileId));

    // Note: S3 deletion would require a storageDelete function
    // For now, we assume the file remains in trash location
    // A separate cleanup job would handle actual S3 deletion
  } catch (error) {
    if (error instanceof FileNotFoundError || error instanceof PurgePasswordError || error instanceof FileOperationError) {
      throw error;
    }
    throw new FileOperationError(
      `Failed to purge file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * List all trashed files for a user
 * @param userId - The user ID
 * @returns Array of trashed file records
 */
export async function listTrashedFiles(userId: number): Promise<FileRecord[]> {
  const db = await getDb();
  if (!db) throw new FileOperationError('Database not available');

  try {
    const fileRecords = await db
      .select()
      .from(files)
      .where(and(eq(files.userId, userId), eq(files.trashed, true)));

    return fileRecords as FileRecord[];
  } catch (error) {
    throw new FileOperationError(
      `Failed to list trashed files: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * List all versions (archives) of a file
 * @param userId - The user ID
 * @param fileId - The file ID
 * @returns Array of file versions with timestamps
 */
export async function listFileVersions(
  userId: number,
  fileId: number
): Promise<FileVersion[]> {
  const db = await getDb();
  if (!db) throw new FileOperationError('Database not available');

  try {
    // Verify file exists and belongs to user
    const fileRecords = await db
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.userId, userId)))
      .limit(1);

    if (fileRecords.length === 0) {
      throw new FileNotFoundError(fileId);
    }

    // Note: Listing S3 objects would require a storageList function
    // This is a placeholder implementation that would need to be
    // integrated with actual S3 listing capabilities
    
    // The archive path pattern is: users/{userId}/archive/{fileId}/{timestamp}
    // Each timestamp represents a version
    
    // For now, return empty array - this would need storageList implementation
    return [];
  } catch (error) {
    if (error instanceof FileNotFoundError) {
      throw error;
    }
    throw new FileOperationError(
      `Failed to list file versions: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Export all functions
// ============================================================================

export default {
  createFile,
  readFile,
  editFile,
  listFiles,
  trashFile,
  restoreFile,
  purgeFile,
  listTrashedFiles,
  listFileVersions,
};
