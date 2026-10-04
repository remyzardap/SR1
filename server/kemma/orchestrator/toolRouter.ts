/**
 * server/kemma/orchestrator/toolRouter.ts
 * Tool routing and execution for Kemma Orchestrator.
 *
 * Validates tool availability, invokes existing executors via executeToolCall,
 * extracts sources, and returns standardized results.
 */

import { executeToolCall } from "../kemmaMax";
import { extractSources, type Source } from "../sources";
import type { ToolExecution } from "../engine";

export interface ToolExecutionResult {
  tool: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  sources: Source[];
  error?: string;
}

export async function executeOrchestratorTool(
  userId: number,
  toolName: string,
  args: unknown,
  allowedTools?: string[]
): Promise<ToolExecutionResult> {
  const startTime = Date.now();

  // Safety checks (invariant G1: no delete/trash/share)
  if (toolName === "trash" || toolName === "purge" || toolName.includes("delete")) {
    return {
      tool: toolName,
      input: args,
      output: { success: false, error: `Tool ${toolName} is forbidden by safety policy.` },
      durationMs: Date.now() - startTime,
      sources: [],
      error: `Tool ${toolName} is forbidden by safety policy.`,
    };
  }

  // Allowed tools check
  if (allowedTools && !allowedTools.includes(toolName)) {
    return {
      tool: toolName,
      input: args,
      output: { success: false, error: `Tool ${toolName} is not permitted in this run.` },
      durationMs: Date.now() - startTime,
      sources: [],
      error: `Tool ${toolName} is not permitted in this run.`,
    };
  }

  try {
    const rawResult = await executeToolCall(userId, toolName, args);
    const durationMs = Date.now() - startTime;
    const sources = extractSources(toolName, rawResult);

    const isErr =
      rawResult &&
      typeof rawResult === "object" &&
      "success" in rawResult &&
      (rawResult as { success?: boolean }).success === false;

    return {
      tool: toolName,
      input: args,
      output: rawResult,
      durationMs,
      sources,
      error: isErr ? (rawResult as { error?: string }).error || "Tool returned failure" : undefined,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      tool: toolName,
      input: args,
      output: { success: false, error: msg },
      durationMs,
      sources: [],
      error: msg,
    };
  }
}
