import { describe, expect, it } from "vitest";
import { STYLE_DEFINITIONS } from "../fileGenerator";
import {
  MAX_REPORT_BYTES,
  exportAtelierReport,
  exportRequestSchema,
  reportByteSize,
  reportToStructuredContent,
  slugifyFilename,
  styleForTheme,
  type AtelierReportInput,
} from "../lib/atelierExport";

// Report shaped like the JSON the generate route emits on its "report" event.
const sampleReport: AtelierReportInput = {
  title: "Northwind Expansion Review",
  subtitle: "First half performance",
  theme: "corporate",
  author: "Test Team",
  date: "2026-09-01",
  sections: [
    { id: "cover", type: "cover", title: "Northwind Expansion Review", content: "Prepared by Test Team" },
    { id: "summary", type: "summary", title: "Executive Summary", content: "Revenue grew across all test regions." },
    { id: "s1", type: "section", title: "Market Context", content: "Demand stayed steady through the period." },
    {
      id: "t1",
      type: "table",
      title: "Regional Sales",
      data: { headers: ["Region", "Revenue"], rows: [["North", "120"], ["South", "80"]] },
    },
    {
      id: "c1",
      type: "chart",
      title: "Quarterly Trend",
      data: { chartType: "bar", labels: ["Q1", "Q2"], values: [10, 14], color: "#2563eb" },
    },
    { id: "img1", type: "image", title: "Storefront", content: "Photo of the flagship store" },
  ],
};

describe("slugifyFilename", () => {
  it("keeps lowercase letters, digits and hyphens", () => {
    expect(slugifyFilename("Northwind Expansion Review")).toBe("northwind-expansion-review");
    expect(slugifyFilename("Q3: Board Plan (Draft) #2")).toBe("q3-board-plan-draft-2");
  });

  it("strips accents", () => {
    expect(slugifyFilename("Café Möller Étude")).toBe("cafe-moller-etude");
  });

  it("caps the slug at 60 characters with no trailing hyphen", () => {
    const result = slugifyFilename(`${"a".repeat(100)} ${"b".repeat(10)}`);
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.endsWith("-")).toBe(false);
  });

  it("falls back to report when nothing usable is left", () => {
    expect(slugifyFilename("   ")).toBe("report");
    expect(slugifyFilename("!!!???")).toBe("report");
    expect(slugifyFilename(undefined)).toBe("report");
  });
});

describe("styleForTheme", () => {
  it("maps the Atelier theme names onto generator styles", () => {
    expect(styleForTheme("corporate").id).toBe("corporate");
    expect(styleForTheme("monochrome").id).toBe("minimal");
    expect(styleForTheme("editorial").id).toBe("serif-classic");
  });

  it("accepts generator style ids directly", () => {
    expect(styleForTheme("dark-tech").id).toBe("dark-tech");
  });

  it("falls back to the first style for unknown themes", () => {
    expect(styleForTheme("neon")).toBe(STYLE_DEFINITIONS[0]);
    expect(styleForTheme(undefined)).toBe(STYLE_DEFINITIONS[0]);
  });
});

describe("reportToStructuredContent", () => {
  it("maps title and subtitle", () => {
    const content = reportToStructuredContent(sampleReport);
    expect(content.title).toBe("Northwind Expansion Review");
    expect(content.subtitle).toBe("First half performance");
  });

  it("uses the cover line or author and date when there is no subtitle", () => {
    const fromCover = reportToStructuredContent({
      title: "Cover only",
      sections: [{ id: "cover", type: "cover", title: "Cover only", content: "Prepared by Test Team" }],
    });
    expect(fromCover.subtitle).toBe("Prepared by Test Team");

    const fromAuthor = reportToStructuredContent({
      title: "No cover",
      author: "Test Team",
      date: "2026-09-01",
      sections: [{ id: "s1", type: "section", title: "Context", content: "Body" }],
    });
    expect(fromAuthor.subtitle).toBe("Test Team, 2026-09-01");
  });

  it("keeps section order and maps every report type", () => {
    const content = reportToStructuredContent(sampleReport);
    expect(content.sections.map((s) => s.heading)).toEqual([
      "Executive Summary",
      "Market Context",
      "Regional Sales",
      "Quarterly Trend",
      "Storefront",
    ]);
    expect(content.sections[1].body).toBe("Demand stayed steady through the period.");
    expect(content.sections[2].tableData).toEqual({
      headers: ["Region", "Revenue"],
      rows: [["North", "120"], ["South", "80"]],
    });
  });

  it("keeps paragraph breaks inside a section body", () => {
    const content = reportToStructuredContent({
      title: "Paragraphs",
      sections: [{ id: "s1", type: "section", title: "Context", content: "First paragraph.\n\nSecond paragraph." }],
    });
    expect(content.sections[0].body).toBe("First paragraph.\n\nSecond paragraph.");
  });

  it("exports charts as their label and value series", () => {
    const content = reportToStructuredContent(sampleReport);
    expect(content.sections[3].tableData).toEqual({
      headers: ["Label", "Value"],
      rows: [["Q1", "10"], ["Q2", "14"]],
    });
  });

  it("gives untitled sections a heading per type", () => {
    const content = reportToStructuredContent({
      title: "Bare report",
      sections: [
        { id: "t1", type: "table", data: { headers: ["A"], rows: [["1"]] } },
        { id: "c1", type: "chart", data: { labels: ["Q1"], values: [1] } },
        { id: "img1", type: "image", content: "Photo of the flagship store" },
        { id: "s1", type: "timeline", content: "Body" },
        { id: "s2", content: "Body" },
      ],
    });
    expect(content.sections.map((s) => s.heading)).toEqual(["Table", "Chart", "Image", "Section", "Section"]);
  });

  it("drops tables without headers and images without any text", () => {
    const content = reportToStructuredContent({
      title: "Sparse",
      sections: [
        { id: "t1", type: "table", title: "Nothing", data: { headers: [], rows: [] } },
        { id: "img1", type: "image" },
      ],
    });
    expect(content.sections).toHaveLength(0);
  });

  it("normalizes table rows to the header width", () => {
    const content = reportToStructuredContent({
      title: "Row shapes",
      sections: [
        {
          id: "t1",
          type: "table",
          title: "Shapes",
          data: { headers: ["A", "B"], rows: [["1"], ["1", "2", "3"]] },
        },
      ],
    });
    expect(content.sections[0].tableData?.rows).toEqual([["1", ""], ["1", "2"]]);
  });

  it("uses worksheet safe and unique headings for tables", async () => {
    const report: AtelierReportInput = {
      title: "Duplicate tables",
      sections: [
        { id: "t1", type: "table", title: "Q3: Revenue [est]", data: { headers: ["A"], rows: [["1"]] } },
        { id: "t2", type: "table", title: "Q3: Revenue [est]", data: { headers: ["A"], rows: [["2"]] } },
      ],
    };
    const content = reportToStructuredContent(report);
    expect(content.sections.map((s) => s.heading)).toEqual(["Q3 Revenue est", "Q3 Revenue est-2"]);
    const { file } = await exportAtelierReport(report, "xlsx", "corporate");
    expect(file.buffer.length).toBeGreaterThan(0);
  });

  it("defaults an empty title and keeps the byte limit at 2 MB", () => {
    expect(reportToStructuredContent({ title: "   ", sections: [] }).title).toBe("Report");
    expect(MAX_REPORT_BYTES).toBe(2 * 1024 * 1024);
  });
});

describe("exportRequestSchema", () => {
  it("accepts a well formed request", () => {
    expect(exportRequestSchema.safeParse({ report: sampleReport, format: "pdf" }).success).toBe(true);
    expect(exportRequestSchema.safeParse({ report: sampleReport, format: "md", theme: "editorial" }).success).toBe(
      true
    );
  });

  it("rejects unknown formats and missing reports", () => {
    expect(exportRequestSchema.safeParse({ report: sampleReport, format: "pptx" }).success).toBe(false);
    expect(exportRequestSchema.safeParse({ format: "pdf" }).success).toBe(false);
    expect(exportRequestSchema.safeParse({ report: { title: "No sections" }, format: "md" }).success).toBe(false);
  });

  it("rejects a report with too many sections", () => {
    const report = {
      title: "Too long",
      sections: Array.from({ length: 81 }, (_, i) => ({ id: `s${i}`, type: "section", content: "Body" })),
    };
    expect(exportRequestSchema.safeParse({ report, format: "md" }).success).toBe(false);
  });

  it("rejects an oversized section body", () => {
    const report = {
      title: "Oversized body",
      sections: [{ id: "s1", type: "section", content: "x".repeat(31_000) }],
    };
    expect(exportRequestSchema.safeParse({ report, format: "md" }).success).toBe(false);
  });
});

describe("reportByteSize", () => {
  it("measures the serialized report against the cap", () => {
    expect(reportByteSize(null)).toBeLessThan(MAX_REPORT_BYTES);
    expect(
      reportByteSize({ title: "Big", sections: [{ content: "x".repeat(MAX_REPORT_BYTES) }] })
    ).toBeGreaterThan(MAX_REPORT_BYTES);
  });
});

describe("exportAtelierReport", () => {
  const formats = [
    { format: "pdf" as const, mime: "application/pdf", magic: "%PDF" },
    {
      format: "docx" as const,
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      magic: "PK",
    },
    {
      format: "xlsx" as const,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      magic: "PK",
    },
    { format: "md" as const, mime: "text/markdown", magic: "# " },
  ];

  for (const { format, mime, magic } of formats) {
    it(`returns a non empty ${format} buffer with the right signature`, async () => {
      const { file, filename } = await exportAtelierReport(sampleReport, format, sampleReport.theme);
      expect(file.mimeType).toBe(mime);
      expect(file.extension).toBe(format);
      expect(file.buffer.length).toBeGreaterThan(0);
      expect(file.buffer.subarray(0, magic.length).toString("utf-8")).toBe(magic);
      expect(filename).toBe(`northwind-expansion-review.${format}`);
    });
  }

  it("renders the report content into markdown", async () => {
    const { file } = await exportAtelierReport(sampleReport, "md", "editorial");
    const text = file.buffer.toString("utf-8");
    expect(text).toContain("# Northwind Expansion Review");
    expect(text).toContain("## Executive Summary");
    expect(text).toContain("| Region | Revenue |");
  });
});
