/**
 * Documents export (formerly Atelier)
 *
 * Maps the report JSON that POST /api/atelier/generate emits onto the
 * StructuredContent shape server/fileGenerator.ts renders, so
 * POST /api/atelier/export can stream it back as a file. Pure functions only:
 * nothing here touches the database, the disk or the network.
 */

import { z } from "zod";
import {
  STYLE_DEFINITIONS,
  generateFile,
  type GeneratedFile,
  type StructuredContent,
  type StyleOption,
} from "../fileGenerator";

// ─── Limits ───────────────────────────────────────────────────────────────────

export const MAX_REPORT_BYTES = 2 * 1024 * 1024;

const MAX_SECTIONS = 80;
const MAX_TITLE_CHARS = 200;
const MAX_BODY_CHARS = 30_000;
const MAX_TABLE_ROWS = 500;
const MAX_TABLE_COLS = 50;
const MAX_CHART_POINTS = 200;
const MAX_CELL_CHARS = 500;
const MAX_FILENAME_CHARS = 60;

// ─── Request schema ───────────────────────────────────────────────────────────

const scalarCell = z.union([z.string().max(MAX_CELL_CHARS), z.number(), z.boolean()]);

const sectionDataSchema = z.object({
  headers: z.array(scalarCell).max(MAX_TABLE_COLS).optional(),
  rows: z.array(z.array(scalarCell).max(MAX_TABLE_COLS)).max(MAX_TABLE_ROWS).optional(),
  chartType: z.string().max(16).optional(),
  labels: z.array(scalarCell).max(MAX_CHART_POINTS).optional(),
  values: z.array(scalarCell).max(MAX_CHART_POINTS).optional(),
  color: z.string().max(9).optional(),
});

const sectionSchema = z.object({
  id: z.string().max(64).nullish(),
  type: z.string().max(32).optional(),
  title: z.string().max(MAX_TITLE_CHARS).nullish(),
  content: z.string().max(MAX_BODY_CHARS).nullish(),
  data: sectionDataSchema.nullish(),
  // References only: apa, mla and harvard use a hanging indent, ieee a numbered list.
  style: z.string().max(16).nullish(),
});

const reportSchema = z.object({
  title: z.string().max(MAX_TITLE_CHARS).nullish(),
  subtitle: z.string().max(MAX_TITLE_CHARS).nullish(),
  theme: z.string().max(32).nullish(),
  author: z.string().max(160).nullish(),
  date: z.string().max(64).nullish(),
  sections: z.array(sectionSchema).min(1).max(MAX_SECTIONS),
});

export const exportRequestSchema = z.object({
  report: reportSchema,
  format: z.enum(["pdf", "docx", "xlsx", "md"]),
  theme: z.string().max(32).optional(),
});

export type AtelierReportInput = z.infer<typeof reportSchema>;
export type AtelierExportFormat = z.infer<typeof exportRequestSchema>["format"];

// ─── Small helpers ────────────────────────────────────────────────────────────

type TableData = NonNullable<StructuredContent["sections"][number]["tableData"]>;
type SectionData = AtelierReportInput["sections"][number]["data"];

function oneLine(value?: string | number | boolean | null): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

// Body text keeps its paragraph breaks; only the edges are trimmed.
function cleanBody(value?: string | null): string {
  return (value ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

function cellToText(value?: string | number | boolean | null): string {
  return oneLine(value).slice(0, MAX_CELL_CHARS);
}

// The PDF generator sizes its columns from the header count, so every row is
// forced to that width.
function tableFrom(data?: SectionData): TableData | undefined {
  const headers = (data?.headers ?? []).map(cellToText);
  if (headers.length === 0) return undefined;

  const rows = (data?.rows ?? []).map((row) => {
    const cells = (row ?? []).map(cellToText);
    if (cells.length >= headers.length) return cells.slice(0, headers.length);
    return [...cells, ...Array(headers.length - cells.length).fill("")];
  });

  return { headers, rows };
}

// fileGenerator has no chart renderer, so a chart exports as its own series.
function chartTableFrom(data?: SectionData): TableData | undefined {
  const labels = data?.labels ?? [];
  const values = data?.values ?? [];
  const points = Math.max(labels.length, values.length);
  if (points === 0) return undefined;

  const rows: string[][] = [];
  for (let i = 0; i < points; i++) {
    rows.push([cellToText(labels[i]), cellToText(values[i])]);
  }
  return { headers: ["Label", "Value"], rows };
}

// Table headings double as XLSX worksheet names: 31 chars max, no * ? : \ / [ ],
// and unique inside the workbook.
function sheetHeading(raw: string, fallback: string, used: Set<string>): string {
  const cleaned = raw.replace(/[*?:\\/[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || fallback;
  let heading = cleaned;
  for (let n = 2; used.has(heading); n++) {
    heading = `${cleaned.slice(0, 28).replace(/-+$/, "")}-${n}`;
  }
  used.add(heading);
  return heading;
}

// ─── References ───────────────────────────────────────────────────────────────

function numbered(style?: string | null): boolean {
  return oneLine(style).toLowerCase() === "ieee";
}

// One entry per line. A leading bullet or "[1]" / "1." label is dropped:
// IEEE is numbered by the renderer and the others hang, so a label would double up.
function referenceEntries(body: string): string[] {
  return body
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*\u2022]\s+|\[\d{1,3}\]\s*|\d{1,3}[.)]\s+)/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// ─── Theme to style ───────────────────────────────────────────────────────────

const ATELIER_THEME_STYLES: Record<string, string> = {
  corporate: "corporate",
  monochrome: "minimal",
  editorial: "serif-classic",
};

export function styleForTheme(theme?: string | null): StyleOption {
  const name = oneLine(theme).toLowerCase();
  const styleId = ATELIER_THEME_STYLES[name] ?? name;
  return STYLE_DEFINITIONS.find((s) => s.id === styleId) ?? STYLE_DEFINITIONS[0];
}

// ─── Filename ─────────────────────────────────────────────────────────────────

export function slugifyFilename(title?: string | null): string {
  const slug = (title ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, MAX_FILENAME_CHARS)
    .replace(/-+$/, "");
  return slug || "report";
}

// ─── Report to StructuredContent ──────────────────────────────────────────────

export function reportToStructuredContent(report: AtelierReportInput): StructuredContent {
  const sections: StructuredContent["sections"] = [];
  const usedHeadings = new Set<string>();
  let coverLine = "";

  for (const section of report.sections ?? []) {
    const title = oneLine(section.title);
    const body = cleanBody(section.content);

    switch (section.type) {
      case "cover":
        // The cover line becomes the document subtitle
        if (!coverLine) coverLine = oneLine(body);
        break;
      case "table": {
        const tableData = tableFrom(section.data);
        if (tableData) {
          sections.push({ heading: sheetHeading(title, "Table", usedHeadings), body, tableData });
        }
        break;
      }
      case "chart": {
        const tableData = chartTableFrom(section.data);
        if (tableData) {
          sections.push({ heading: sheetHeading(title, "Chart", usedHeadings), body, tableData });
        }
        break;
      }
      case "abstract": {
        if (body) sections.push({ heading: "Abstract", body, kind: "abstract" });
        break;
      }
      case "references": {
        const items = referenceEntries(body);
        if (items.length > 0) {
          sections.push({
            heading: sheetHeading(title || "References", "References", usedHeadings),
            body: items.join("\n"),
            kind: "references",
            items,
            numbered: numbered(section.style),
          });
        }
        break;
      }
      case "image":
        if (title || body) sections.push({ heading: title || "Image", body: body || title });
        break;
      default:
        // summary, plain sections and anything unexpected keep their position
        if (title || body) sections.push({ heading: title || "Section", body });
    }
  }

  const authorDate = [oneLine(report.author), oneLine(report.date)].filter(Boolean).join(", ");
  const subtitle = oneLine(report.subtitle) || coverLine || authorDate;

  return {
    title: oneLine(report.title) || "Report",
    subtitle: subtitle.slice(0, MAX_TITLE_CHARS) || undefined,
    sections,
  };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function reportByteSize(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? ""), "utf-8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export async function exportAtelierReport(
  report: AtelierReportInput,
  format: AtelierExportFormat,
  theme?: string | null
): Promise<{ file: GeneratedFile; filename: string }> {
  const content = reportToStructuredContent(report);
  const file = await generateFile(content, format, styleForTheme(theme));
  return { file, filename: `${slugifyFilename(content.title)}.${file.extension}` };
}
