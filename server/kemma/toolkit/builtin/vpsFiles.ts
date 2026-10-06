/**
 * vps_files: admin-only, read-only access to files on the VPS host. `available` re-checks the
 * role on every call, same as the executor itself, so a demoted admin loses the tool immediately.
 */
import { z } from "zod";
import { registerTool } from "../registry";
import type { ToolContext } from "../types";
import { isAdminUser, runVpsFiles, VpsFilesError } from "../../executors/vpsFiles";
import { createErrorResult, createSuccessResult, type LegacyToolResult } from "./legacy";

const VpsFilesArgs = z.object({
  action: z.enum(["list", "read", "stat", "search"]).describe("What to do"),
  path: z.string().optional().describe("File or directory path, relative to the VPS root"),
  query: z.string().optional().describe("File name substring to find (search only)"),
  offset: z.number().optional().describe("Byte offset to start reading from (read only)"),
});

async function available(ctx: ToolContext): Promise<boolean> {
  if (ctx.isSubAgent) return false;
  try {
    return await isAdminUser(ctx.userId);
  } catch {
    return false;
  }
}

async function execute(args: z.infer<typeof VpsFilesArgs>, ctx: ToolContext): Promise<LegacyToolResult> {
  try {
    return createSuccessResult(await runVpsFiles(ctx.userId, args.action, args));
  } catch (err) {
    if (err instanceof VpsFilesError) return createErrorResult(err.message, err.code);
    throw err;
  }
}

export function registerVpsFiles(): void {
  registerTool({
    name: "vps_files",
    description:
      "Admin-only, read-only access to files on the VPS (the host server). Actions: list a directory, read a text file (up to 200KB, use offset to continue), stat a path, search file names under a directory. Secret files (.env, keys, secrets folders) are blocked. Paths are relative to the VPS root; use \".\" for the root.",
    args: VpsFilesArgs,
    risk: "read",
    parallelSafe: true,
    timeoutMs: 15_000,
    maxModelChars: 20_000,
    available,
    execute,
  });
}
