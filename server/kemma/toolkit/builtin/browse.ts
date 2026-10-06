import { z } from "zod";
import { registerTool } from "../registry";
import { browse } from "../../kemmaMax";
import { createErrorResult, createSuccessResult, type LegacyToolResult } from "./legacy";
import type { ToolContext } from "../types";

const BrowseArgs = z.object({
  url: z.string().describe("The URL of the web page to fetch"),
  extractText: z.boolean().optional().describe("Extract main text content from the page (default: true)"),
  extractLinks: z.boolean().optional().describe("Extract all links from the page (default: false)"),
  extractImages: z.boolean().optional().describe("Extract image URLs from the page (default: false)"),
  maxLength: z.number().optional().describe("Maximum character length for extracted text (default: 10000)"),
  waitForSelector: z.string().optional().describe("CSS selector to wait for before extracting (for dynamic content)"),
});

async function execute(args: z.infer<typeof BrowseArgs>, ctx: ToolContext): Promise<LegacyToolResult> {
  if (typeof args.url !== "string") return createErrorResult('Missing or invalid "url" parameter', "INVALID_PARAMS");
  return createSuccessResult(
    await browse(args.url, {
      extractText: args.extractText,
      extractLinks: args.extractLinks,
      extractImages: args.extractImages,
      maxLength: args.maxLength,
      waitForSelector: args.waitForSelector,
      signal: ctx.signal,
    }),
  );
}

export function registerBrowse(): void {
  registerTool({
    name: "browse",
    description: "Fetch and parse web page content. Extracts text, metadata, and structured content from URLs.",
    args: BrowseArgs,
    risk: "read",
    parallelSafe: true,
    timeoutMs: 65_000,
    maxModelChars: 20_000,
    execute,
  });
}
