import { z } from "zod";
import { registerTool } from "../registry";
import type { ToolContext } from "../types";
import { generateAndSaveFile as generateFile } from "../../executors/generateFile";
import { STYLE_DEFINITIONS, type StructuredContent, type StyleOption } from "../../../fileGenerator";
import { createErrorResult, createSuccessResult, type LegacyToolResult } from "./legacy";

const GenerateFileArgs = z.object({
  format: z.enum(["pdf", "docx", "xlsx", "csv", "txt", "json", "html", "md"]).describe("Output file format"),
  content: z.string().describe("Content to include in the generated file (text, HTML, JSON, etc.)"),
  template: z.string().optional().describe("Template identifier or predefined template name"),
  filename: z.string().optional().describe("Desired filename for the generated file (without extension)"),
  metadata: z.string().optional().describe("JSON string containing metadata (title, author, subject, keywords, etc.)"),
  styling: z.string().optional().describe("JSON string containing styling options (fonts, colors, margins, etc.)"),
  dataSource: z.string().optional().describe("Data source identifier for data-driven document generation"),
});

async function execute(args: z.infer<typeof GenerateFileArgs>, ctx: ToolContext): Promise<LegacyToolResult> {
  if (typeof args.format !== "string") return createErrorResult('Missing or invalid "format" parameter', "INVALID_PARAMS");
  if (typeof args.content !== "string") return createErrorResult('Missing or invalid "content" parameter', "INVALID_PARAMS");
  const name = typeof args.filename === "string" ? args.filename : `document-${Date.now()}`;

  let structuredContent: StructuredContent;
  try {
    const parsed = JSON.parse(args.content);
    structuredContent =
      parsed && typeof parsed === "object" && Array.isArray(parsed.sections)
        ? (parsed as StructuredContent)
        : { title: name, sections: [{ heading: "Content", body: args.content }] };
  } catch {
    structuredContent = { title: name, sections: [{ heading: "Content", body: args.content }] };
  }

  let resolvedStyle: StyleOption = STYLE_DEFINITIONS[0];
  if (typeof args.styling === "string") {
    const byId = STYLE_DEFINITIONS.find((s) => s.id === args.styling);
    if (byId) {
      resolvedStyle = byId;
    } else {
      try {
        const parsedStyle = JSON.parse(args.styling);
        if (parsedStyle && typeof parsedStyle === "object") resolvedStyle = { ...STYLE_DEFINITIONS[0], ...parsedStyle };
      } catch {
        /* fall back to default style */
      }
    }
  }

  return createSuccessResult(await generateFile(ctx.userId, name, structuredContent, args.format, resolvedStyle));
}

export function registerGenerateFile(): void {
  registerTool({
    name: "generate_file",
    description: "Generate documents in various formats including PDF, DOCX, XLSX, CSV, and more. Supports templates and custom styling.",
    args: GenerateFileArgs,
    risk: "write",
    parallelSafe: false,
    timeoutMs: 30_000,
    maxModelChars: 4_000,
    execute,
  });
}
