/**
 * safe_files: secure file operations. The agent may create, read, edit, list, and view versions.
 * Trash, restore, purge, delete and sharing are UI-only actions; they are never exposed as agent
 * tools (G1).
 */
import { z } from "zod";
import { registerTool } from "../registry";
import type { ToolContext } from "../types";
import { createFile, editFile, listFiles, listFileVersions, readFile } from "../../executors/safeFiles";
import type { LegacyToolResult } from "./legacy";
import { createErrorResult, createSuccessResult } from "./legacy";

const SafeFilesArgs = z.object({
  action: z.enum(["create", "read", "edit", "list", "versions"]).describe("The file operation to perform"),
  path: z.string().optional().describe("File path for create action (e.g., '/documents/report.txt')"),
  content: z.string().optional().describe("File content for create or edit actions"),
  mimeType: z.string().optional().describe("MIME type for create action (e.g., 'text/plain', 'application/json')"),
  fileId: z.string().optional().describe("Unique file identifier for read, edit, or versions actions"),
  newContent: z.string().optional().describe("New content for edit action (archives old version before overwriting)"),
});

function coerceFileId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isInteger(Number(value))) return Number(value);
  return null;
}

async function execute(args: z.infer<typeof SafeFilesArgs>, ctx: ToolContext): Promise<LegacyToolResult> {
  const { userId } = ctx;
  switch (args.action) {
    case "create": {
      if (typeof args.path !== "string") return createErrorResult('Missing or invalid "path" parameter', "INVALID_PARAMS");
      if (typeof args.content !== "string") return createErrorResult('Missing or invalid "content" parameter', "INVALID_PARAMS");
      return createSuccessResult(await createFile(userId, args.path, Buffer.from(args.content), args.mimeType ?? "application/octet-stream"));
    }
    case "read": {
      const fileId = coerceFileId(args.fileId);
      if (fileId === null) return createErrorResult('Missing or invalid "fileId" parameter', "INVALID_PARAMS");
      return createSuccessResult(await readFile(userId, fileId));
    }
    case "edit": {
      const fileId = coerceFileId(args.fileId);
      if (fileId === null) return createErrorResult('Missing or invalid "fileId" parameter', "INVALID_PARAMS");
      if (typeof args.newContent !== "string") return createErrorResult('Missing or invalid "newContent" parameter', "INVALID_PARAMS");
      return createSuccessResult(await editFile(userId, fileId, Buffer.from(args.newContent)));
    }
    case "list":
      return createSuccessResult(await listFiles(userId));
    case "versions": {
      const fileId = coerceFileId(args.fileId);
      if (fileId === null) return createErrorResult('Missing or invalid "fileId" parameter', "INVALID_PARAMS");
      return createSuccessResult(await listFileVersions(userId, fileId));
    }
    default:
      return createErrorResult(`Unknown safe_files action: ${args.action}`, "UNKNOWN_ACTION");
  }
}

export function registerSafeFiles(): void {
  registerTool({
    name: "safe_files",
    description: "Secure file operations. Actions: create, read, edit, list, versions. The agent cannot delete, trash, restore, purge or share files.",
    args: SafeFilesArgs,
    risk: "write",
    parallelSafe: false,
    timeoutMs: 15_000,
    maxModelChars: 20_000,
    execute,
  });
}
