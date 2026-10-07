/**
 * read_result tool (P1-13)
 *
 * The context manager replaces old tool results with their head plus a
 * `[full result: result_id=ctxres_…]` handle and keeps the full body in the run's result store.
 * This tool is the way back: it reads one slice at a time, capped so that paging through a saved
 * result cannot recreate the overflow the shrink was meant to avoid.
 */
import { z } from "zod";
import { flag } from "../../../core/flags";
import {
  MAX_SLICE_CHARS,
  readResultSlice,
  RESULT_ID_PREFIX,
  resultStoreFor,
} from "../../context";
import { registerTool } from "../registry";
import type { ToolContext } from "../types";
import {
  createErrorResult,
  createSuccessResult,
  type LegacyToolResult,
} from "./legacy";

const ReadResultArgs = z.object({
  id: z
    .string()
    .min(1)
    .max(160)
    .describe(
      `The result id from a [full result: result_id=...] marker (it starts with "${RESULT_ID_PREFIX}").`,
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Character offset to start reading from. Default 0."),
  length: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      `How many characters to read. Default and maximum ${MAX_SLICE_CHARS}.`,
    ),
});

async function execute(
  args: z.infer<typeof ReadResultArgs>,
  ctx: ToolContext,
): Promise<LegacyToolResult> {
  if (!flag("CONTEXT_MANAGER"))
    return createErrorResult("read_result is not available.", "NOT_ALLOWED");
  const slice = readResultSlice(
    resultStoreFor(ctx.runId),
    args.id,
    args.offset,
    args.length,
  );
  if (!slice.ok) return createErrorResult(slice.error, "INVALID_PARAMS");
  return createSuccessResult({
    id: args.id,
    text: slice.text,
    offset: slice.offset,
    length: slice.length,
    totalChars: slice.totalChars,
    remaining: slice.remaining,
  });
}

export function registerReadResult(): void {
  registerTool({
    name: "read_result",
    description:
      "Read a tool result that was shortened to a `[full result: result_id=...]` marker. Returns part of the saved text along with how many characters remain, so you can page through it with `offset`. Use it when you need the whole of an older search, browse or file read.",
    args: ReadResultArgs,
    risk: "read",
    parallelSafe: true,
    timeoutMs: 5_000,
    maxModelChars: MAX_SLICE_CHARS,
    // Offered only while the manager is on: nothing writes a result handle with the flag off, so the
    // tool would be something the model can only mis-use.
    available: () => flag("CONTEXT_MANAGER"),
    execute,
  });
}
