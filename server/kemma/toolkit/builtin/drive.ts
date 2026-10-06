/**
 * Google Drive tools. Available only when the user has Drive connected (checked per call so the
 * tool list reflects the live connection state). G2 confines access to the Sutaeru root folder
 * (enforced in server/services/google.ts); G1 means no delete/trash/share tool is ever offered —
 * drive_move only relocates within the Sutaeru root, and drive_edit only stages a pending edit.
 */
import { z } from "zod";
import { registerTool } from "../registry";
import type { ToolContext } from "../types";
import {
  createDriveFolder,
  getConnectionStatus,
  listDriveFiles,
  moveDriveFile,
  readDriveFile,
  uploadDriveFile,
} from "../../../services/google";
import { createErrorResult, createSuccessResult, type LegacyToolResult } from "./legacy";

const driveFolderCache = new Map<string, string>();

async function getDriveRootFolder(userId: number): Promise<string | undefined> {
  const cacheKey = `root:${userId}`;
  if (driveFolderCache.has(cacheKey)) return driveFolderCache.get(cacheKey);
  const envRoot = process.env.DRIVE_ROOT_FOLDER_ID?.trim();
  if (envRoot) {
    driveFolderCache.set(cacheKey, envRoot);
    return envRoot;
  }
  try {
    const folder = await createDriveFolder(userId, "Sutaeru");
    if (folder.id) driveFolderCache.set(cacheKey, folder.id);
    return folder.id ?? undefined;
  } catch {
    return undefined;
  }
}

async function ensureDriveFolderPath(userId: number, folderPath: string): Promise<string | undefined> {
  const rootId = await getDriveRootFolder(userId);
  if (!rootId) return undefined;
  const segments = folderPath.split("/").filter(Boolean);
  let parentId = rootId;
  for (const segment of segments) {
    const cacheKey = `${userId}:${parentId}/${segment}`;
    if (driveFolderCache.has(cacheKey)) {
      parentId = driveFolderCache.get(cacheKey)!;
      continue;
    }
    try {
      const folder = await createDriveFolder(userId, segment, parentId);
      const id = folder.id || parentId;
      driveFolderCache.set(cacheKey, id);
      parentId = id;
    } catch {
      // Keep parentId unchanged on error
    }
  }
  return parentId;
}

async function driveConnected(ctx: ToolContext): Promise<boolean> {
  try {
    return (await getConnectionStatus(ctx.userId)).connected;
  } catch {
    return false;
  }
}

// ── drive_search ─────────────────────────────────────────────────────────────
const DriveSearchArgs = z.object({
  query: z.string().describe("Search term to match against file names"),
  maxResults: z.number().optional().describe("Maximum results to return (default 10)"),
});

async function executeSearch(args: z.infer<typeof DriveSearchArgs>, ctx: ToolContext): Promise<LegacyToolResult> {
  if (typeof args.query !== "string") return createErrorResult('Missing or invalid "query" parameter', "INVALID_PARAMS");
  return createSuccessResult(await listDriveFiles(ctx.userId, typeof args.maxResults === "number" ? args.maxResults : 10, args.query));
}

// ── drive_read ────────────────────────────────────────────────────────────────
const DriveReadArgs = z.object({
  fileId: z.string().describe("The Google Drive file id"),
});

async function executeRead(args: z.infer<typeof DriveReadArgs>, ctx: ToolContext): Promise<LegacyToolResult> {
  if (typeof args.fileId !== "string") return createErrorResult('Missing or invalid "fileId" parameter', "INVALID_PARAMS");
  return createSuccessResult(await readDriveFile(ctx.userId, args.fileId));
}

// ── drive_create ──────────────────────────────────────────────────────────────
const DriveCreateArgs = z.object({
  name: z.string().describe("File name including extension"),
  content: z.string().describe("File content"),
  mimeType: z.string().optional().describe("MIME type (default text/plain)"),
  folderPath: z.string().optional().describe("Optional subfolder path inside Sutaeru root, e.g. 'SpaceName/documents'"),
});

async function executeCreate(args: z.infer<typeof DriveCreateArgs>, ctx: ToolContext): Promise<LegacyToolResult> {
  if (typeof args.name !== "string") return createErrorResult('Missing or invalid "name" parameter', "INVALID_PARAMS");
  if (typeof args.content !== "string") return createErrorResult('Missing or invalid "content" parameter', "INVALID_PARAMS");
  const parentId = typeof args.folderPath === "string" && args.folderPath.trim()
    ? await ensureDriveFolderPath(ctx.userId, args.folderPath.trim())
    : await getDriveRootFolder(ctx.userId);
  const uploaded = await uploadDriveFile(ctx.userId, args.name, args.mimeType ?? "text/plain", Buffer.from(args.content), parentId);
  return createSuccessResult(uploaded);
}

// ── drive_edit (G3: staged only, never applied here) ─────────────────────────
const DriveEditArgs = z.object({
  fileId: z.string().describe("The Google Drive file id"),
  newContent: z.string().describe("The proposed new file content"),
  reason: z.string().describe("Explanation of the change"),
});

async function executeEdit(args: z.infer<typeof DriveEditArgs>, ctx: ToolContext): Promise<LegacyToolResult> {
  if (typeof args.fileId !== "string") return createErrorResult('Missing or invalid "fileId" parameter', "INVALID_PARAMS");
  if (typeof args.newContent !== "string") return createErrorResult('Missing or invalid "newContent" parameter', "INVALID_PARAMS");
  if (typeof args.reason !== "string") return createErrorResult('Missing or invalid "reason" parameter', "INVALID_PARAMS");
  const current = await readDriveFile(ctx.userId, args.fileId);
  return createSuccessResult({
    pending: true,
    fileId: args.fileId,
    currentPreview: current.text.slice(0, 500),
    proposedPreview: args.newContent.slice(0, 500),
    reason: args.reason,
    message: "Edit is staged and waiting for your confirmation in the UI. It has not been applied yet.",
  });
}

// ── drive_move (within the Sutaeru root only) ─────────────────────────────────
const DriveMoveArgs = z.object({
  fileId: z.string().describe("The Google Drive file id"),
  folderPath: z.string().describe("Target subfolder path inside Sutaeru root"),
});

async function executeMove(args: z.infer<typeof DriveMoveArgs>, ctx: ToolContext): Promise<LegacyToolResult> {
  if (typeof args.fileId !== "string") return createErrorResult('Missing or invalid "fileId" parameter', "INVALID_PARAMS");
  if (typeof args.folderPath !== "string") return createErrorResult('Missing or invalid "folderPath" parameter', "INVALID_PARAMS");
  const newParentId = await ensureDriveFolderPath(ctx.userId, args.folderPath.trim());
  if (!newParentId) return createErrorResult("Could not resolve Drive folder", "DRIVE_FOLDER_ERROR");
  await moveDriveFile(ctx.userId, args.fileId, newParentId);
  return createSuccessResult({ success: true, folderPath: args.folderPath });
}

export { DRIVE_TOOL_NAMES } from "../names";

export function registerDriveTools(): void {
  registerTool({
    name: "drive_search",
    description: "Search the user's Google Drive by name or query. Returns file id, name, mimeType and webViewLink.",
    args: DriveSearchArgs,
    risk: "read",
    parallelSafe: true,
    timeoutMs: 15_000,
    maxModelChars: 10_000,
    available: driveConnected,
    execute: executeSearch,
  });
  registerTool({
    name: "drive_read",
    description: "Read the text content of a Google Drive file by its id. Works for Google Docs (exported as text) and plain text/binary files.",
    args: DriveReadArgs,
    risk: "read",
    parallelSafe: true,
    timeoutMs: 20_000,
    maxModelChars: 20_000,
    available: driveConnected,
    execute: executeRead,
  });
  registerTool({
    name: "drive_create",
    description: "Create a new file in the user's Google Drive under the Sutaeru root folder. Returns the file id and link.",
    args: DriveCreateArgs,
    risk: "write",
    parallelSafe: false,
    timeoutMs: 20_000,
    maxModelChars: 4_000,
    available: driveConnected,
    execute: executeCreate,
  });
  registerTool({
    name: "drive_edit",
    description: "Propose an edit to an existing Google Drive file. The change is staged as a pending revision and must be confirmed in the UI before it is applied. Does not modify the file immediately.",
    args: DriveEditArgs,
    risk: "write",
    requiresApproval: true,
    parallelSafe: false,
    timeoutMs: 20_000,
    maxModelChars: 4_000,
    available: driveConnected,
    execute: executeEdit,
  });
  registerTool({
    name: "drive_move",
    description: "Move a Google Drive file to a different folder within the Sutaeru root. Returns success.",
    args: DriveMoveArgs,
    risk: "write",
    parallelSafe: false,
    timeoutMs: 20_000,
    maxModelChars: 2_000,
    available: driveConnected,
    execute: executeMove,
  });
}

