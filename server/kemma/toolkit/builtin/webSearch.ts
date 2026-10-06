import { z } from "zod";
import { registerTool } from "../registry";
import { webSearch } from "../../executors/webSearch";
import { createErrorResult, createSuccessResult, type LegacyToolResult } from "./legacy";

const WebSearchArgs = z.object({
  query: z.string().describe("The search query to execute"),
  numResults: z.number().optional().describe("Number of results to return (default: 5, max: 10)"),
  includeCitations: z.boolean().optional().describe("Whether to include source citations in results (default: true)"),
  recencyDays: z.number().optional().describe("Limit results to content published within this many days (optional)"),
});

async function execute(args: z.infer<typeof WebSearchArgs>): Promise<LegacyToolResult> {
  if (typeof args.query !== "string") return createErrorResult('Missing or invalid "query" parameter', "INVALID_PARAMS");
  return createSuccessResult(await webSearch(args.query));
}

export function registerWebSearch(): void {
  registerTool({
    name: "web_search",
    description: "Perform web searches using Perplexity API. Returns search results with citations and summaries.",
    args: WebSearchArgs,
    risk: "read",
    parallelSafe: true,
    timeoutMs: 30_000,
    maxModelChars: 20_000,
    execute,
  });
}
