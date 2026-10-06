import { z } from "zod";
import { registerTool } from "../registry";
import type { ToolContext } from "../types";
import { webSearch } from "../../executors/webSearch";
import { createErrorResult, createSuccessResult, type LegacyToolResult } from "./legacy";

const WebSearchArgs = z.object({
  query: z.string().describe("The search query to execute"),
  numResults: z.number().optional().describe("Number of results to return (default: 5, max: 10)"),
  includeCitations: z.boolean().optional().describe("Whether to include source citations in results (default: true)"),
  recencyDays: z.number().optional().describe("Limit results to content published within this many days (optional)"),
  recency: z
    .enum(["day", "week", "month", "year"])
    .optional()
    .describe("Limit results to this recent (P1-08 search provider layer; ignored unless SEARCH_V2 is on)"),
  include_domains: z
    .array(z.string())
    .optional()
    .describe("Only return results from these domains (P1-08 search provider layer; ignored unless SEARCH_V2 is on)"),
  exclude_domains: z
    .array(z.string())
    .optional()
    .describe("Never return results from these domains (P1-08 search provider layer; ignored unless SEARCH_V2 is on)"),
  vertical: z
    .enum(["web", "news"])
    .optional()
    .describe("Search vertical (P1-08 search provider layer; ignored unless SEARCH_V2 is on)"),
  depth: z
    .enum(["standard", "deep"])
    .optional()
    .describe('"deep" fans the query out to two providers in parallel and fuses the results (P1-08 search provider layer; ignored unless SEARCH_V2 is on)'),
});

async function execute(args: z.infer<typeof WebSearchArgs>, ctx: ToolContext): Promise<LegacyToolResult> {
  if (typeof args.query !== "string") return createErrorResult('Missing or invalid "query" parameter', "INVALID_PARAMS");
  return createSuccessResult(
    await webSearch(args.query, {
      recency: args.recency,
      includeDomains: args.include_domains,
      excludeDomains: args.exclude_domains,
      vertical: args.vertical,
      depth: args.depth,
      userId: ctx.userId,
      sessionId: ctx.sessionId,
    })
  );
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
