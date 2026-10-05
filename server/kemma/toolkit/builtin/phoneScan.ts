import { z } from "zod";
import { registerTool } from "../registry";
import { phoneScan, type ScanAction, type ScanOptions } from "../../executors/phoneScan";
import { createSuccessResult, type LegacyToolResult } from "./legacy";

const PhoneScanArgs = z.object({
  operation: z.enum(["scan", "upload", "list", "delete", "sync", "preview"]).describe("The phone operation to perform"),
  deviceId: z.string().optional().describe("Unique identifier for the connected mobile device"),
  sourcePath: z.string().optional().describe("Source file path on the phone for upload or scan operations"),
  destinationPath: z.string().optional().describe("Destination path for uploaded or scanned files"),
  scanType: z.enum(["document", "photo", "qr", "barcode"]).optional().describe("Type of scan for scan operation"),
  fileTypes: z.array(z.string().describe("File extension or MIME type pattern")).optional().describe("Filter file types for list operation"),
  autoCrop: z.boolean().optional().describe("Enable automatic cropping for document scans (default: true)"),
  quality: z.enum(["low", "medium", "high", "original"]).optional().describe("Scan/photo quality setting"),
});

async function execute(args: z.infer<typeof PhoneScanArgs>): Promise<LegacyToolResult> {
  // SR1's phoneScan(action, options?) generates platform-specific scan instructions. kemmaMax.ts's
  // original dispatcher mapped scanType -> action when it names a valid ScanAction, and read a
  // "target" field for options.path that the tool's own schema never declared (so it was always
  // undefined in practice). Kept verbatim, including that dead path, for identical behavior.
  const validActions: ScanAction[] = ["scan", "categorize", "duplicates", "suggest_cleanup"];
  const action: ScanAction =
    typeof args.scanType === "string" && (validActions as string[]).includes(args.scanType)
      ? (args.scanType as ScanAction)
      : "scan";
  const options: ScanOptions | undefined = undefined;
  return createSuccessResult(await phoneScan(action, options));
}

export function registerPhoneScan(): void {
  registerTool({
    name: "phone_scan",
    description: "Bridge tool for phone file operations. Enables scanning, uploading, and managing files from mobile devices.",
    args: PhoneScanArgs,
    risk: "write",
    parallelSafe: false,
    timeoutMs: 20_000,
    maxModelChars: 8_000,
    execute,
  });
}
