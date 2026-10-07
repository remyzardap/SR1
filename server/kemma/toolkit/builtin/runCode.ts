import { z } from "zod";
import { registerTool } from "../registry";
import { runCode } from "../../kemmaMax";
import { createErrorResult, createSuccessResult, type LegacyToolResult } from "./legacy";
import type { ToolContext } from "../types";

const RunCodeArgs = z.object({
  language: z.enum(["python", "nodejs", "javascript", "bash", "r"]).optional().describe("Programming language to execute (python, javascript/nodejs, bash, r)"),
  code: z.string().describe("The code to execute"),
  timeout: z.number().optional().describe("Execution timeout in seconds (default: 30, max: 300)"),
  dependencies: z.array(z.string().describe("Package name (e.g., 'requests', 'lodash')")).optional().describe("List of npm/pip packages to install before execution"),
  inputData: z.string().optional().describe("Input data to pass to the code (available as stdin or variable)"),
  environment: z.array(z.string().describe("Environment variable in KEY=VALUE format")).optional().describe("Environment variables as KEY=VALUE strings"),
});

async function execute(args: z.infer<typeof RunCodeArgs>, ctx: ToolContext): Promise<LegacyToolResult> {
  if (typeof args.code !== "string") return createErrorResult('Missing or invalid "code" parameter', "INVALID_PARAMS");
  const resolvedLanguage = args.language ?? "python";
  const timeoutMs = typeof args.timeout === "number" && args.timeout > 0 ? args.timeout * 1000 : undefined;
  return createSuccessResult(
    await runCode(resolvedLanguage, args.code, ctx.signal, {
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      emit: ctx.emit,
      timeoutMs,
    })
  );
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
