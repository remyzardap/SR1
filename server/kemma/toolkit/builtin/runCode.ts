import { z } from "zod";
import { registerTool } from "../registry";
import { runCode } from "../../kemmaMax";
import { createErrorResult, createSuccessResult, type LegacyToolResult } from "./legacy";
import type { ToolContext } from "../types";

const RunCodeArgs = z.object({
  language: z.enum(["python", "nodejs"]).optional().describe("Programming language to execute"),
  code: z.string().describe("The code to execute"),
  timeout: z.number().optional().describe("Execution timeout in seconds (default: 30, max: 300)"),
  dependencies: z.array(z.string().describe("Package name (e.g., 'requests', 'lodash')")).optional().describe("List of npm/pip packages to install before execution"),
  inputData: z.string().optional().describe("Input data to pass to the code (available as stdin or variable)"),
  environment: z.array(z.string().describe("Environment variable in KEY=VALUE format")).optional().describe("Environment variables as KEY=VALUE strings"),
});

async function execute(args: z.infer<typeof RunCodeArgs>, ctx: ToolContext): Promise<LegacyToolResult> {
  if (typeof args.code !== "string") return createErrorResult('Missing or invalid "code" parameter', "INVALID_PARAMS");
  // FIX kept from kemmaMax.ts: runCode is (language, code); default language to "python" when omitted.
  const resolvedLanguage: "python" | "nodejs" = args.language === "nodejs" ? "nodejs" : "python";
  return createSuccessResult(await runCode(resolvedLanguage, args.code, ctx.signal));
}

export function registerRunCode(): void {
  registerTool({
    name: "run_code",
    description: "Execute Python or Node.js code in a sandboxed environment. Supports code execution with output capture and error handling.",
    args: RunCodeArgs,
    risk: "write",
    parallelSafe: false,
    timeoutMs: 45_000,
    maxModelChars: 20_000,
    execute,
  });
}
