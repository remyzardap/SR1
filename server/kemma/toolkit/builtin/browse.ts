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
  query: z.string().optional().describe("What you're looking for on this page. When the page is long, the most relevant sections are returned instead of the whole thing."),
  interactive: z.boolean().optional().describe("Use a real browser to render the page (slower). Only set this when the page needs JavaScript or a login/click to show its content."),
  // `max_chars` is the reader's cap (P1-09 spec schema); `maxLength` above stays the knob the
  // browser-use path understands, so `max_chars` wins when both are given.
  max_chars: z.number().optional().describe("Maximum characters of page content to return (default: 10000)"),
});

async function execute(args: z.infer<typeof BrowseArgs>, ctx: ToolContext): Promise<LegacyToolResult> {
  if (typeof args.url !== "string") return createErrorResult('Missing or invalid "url" parameter', "INVALID_PARAMS");
  return createSuccessResult(
    await browse(args.url, {
      extractText: args.extractText,
      extractLinks: args.extractLinks,
      extractImages: args.extractImages,
      maxLength: args.max_chars ?? args.maxLength,
      waitForSelector: args.waitForSelector,
      signal: ctx.signal,
      query: args.query,
      interactive: args.interactive,
      userId: ctx.userId,
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
