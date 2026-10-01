import { describe, expect, it } from "vitest";
import {
  exportAtelierReport,
  exportRequestSchema,
  reportToStructuredContent,
  slugifyFilename,
} from "./atelierExport";

// Gap coverage for the existing routers/atelierExport.test.ts:
// cover-only (empty after mapping) reports, CJK/unicode payloads, and
// reports the LLM could plausibly emit that the export contract silently
// drops or rejects.

describe("empty and near-empty reports (audit)", () => {
  const coverOnly = {
    title: "Solo Cover",
    sections: [{ id: "cover", type: "cover", content: "Prepared by Nobody" }],
  };

  it("cover-only report maps to zero content sections but still exports every format", async () => {
    const content = reportToStructuredContent(coverOnly as any);
    expect(content.sections).toHaveLength(0);
    expect(content.subtitle).toBe("Prepared by Nobody");
    for (const format of ["md", "pdf", "docx", "xlsx"] as const) {
      const { file, filename } = await exportAtelierReport(coverOnly as any, format, null);
      expect(file.buffer.length).toBeGreaterThan(0);
      expect(filename).toBe(`solo-cover.${format}`);
    }
  });

  it("a table whose cells are all empty renders but keeps header-only shape", async () => {
    const report = {
      title: "Headerless",
      sections: [{ id: "t1", type: "table", title: "T", data: { headers: ["", ""], rows: [["", ""]] } }],
    };
    const content = reportToStructuredContent(report as any);
    expect(content.sections[0].tableData).toEqual({ headers: ["", ""], rows: [["", ""]] });
    const { file } = await exportAtelierReport(report as any, "md", null);
    expect(file.buffer.toString("utf-8")).toContain("|  |  |");
  });
});

describe("unicode payloads (audit)", () => {
  const unicodeReport = {
    title: "事業計画レポート Q4Expansion",
    sections: [
      { id: "s1", type: "section", title: "はじめに", content: "日本語の本文。Ünïcödé ok. Привет." },
      { id: "t1", type: "table", title: "地域", data: { headers: ["地域", "売上"], rows: [["東京", "¥1,000"]] } },
    ],
  };

  it("markdown keeps CJK and accents byte-for-byte", async () => {
    const { file } = await exportAtelierReport(unicodeReport as any, "md", "corporate");
    const text = file.buffer.toString("utf-8");
    expect(text).toContain("事業計画レポート");
    expect(text).toContain("日本語の本文");
    expect(text).toContain("東京");
  });

  it("pdf/docx/xlsx all complete without throwing on CJK content", async () => {
    for (const format of ["pdf", "docx", "xlsx"] as const) {
      const { file } = await exportAtelierReport(unicodeReport as any, format, "editorial");
      expect(file.buffer.length).toBeGreaterThan(0);
    }
  });

  it("filename is always ASCII-safe for the Content-Disposition header", async () => {
    const { filename } = await exportAtelierReport(unicodeReport as any, "md", null);
    // CJK collapses away and the latin fragment survives: always header-safe.
    expect(filename).toBe("q4expansion.md");
    // eslint-disable-next-line no-control-regex
    expect(/^[a-z0-9.\-]+$/.test(filename)).toBe(true);
    expect(slugifyFilename("日本語のみ")).toBe("report");
  });

  it("markdown table cells containing the pipe character corrupt the table (gap)", async () => {
    const report = {
      title: "Pipes",
      sections: [{ id: "t1", type: "table", title: "T", data: { headers: ["A"], rows: [["a|b"]] } }],
    };
    const { file } = await exportAtelierReport(report as any, "md", null);
    const line = file.buffer.toString("utf-8").split("\n").find((l) => l.startsWith("| a"));
    // The renderer does not escape the pipe, so the row gains a phantom column.
    expect(line).toBe("| a|b |");
  });
});

describe("report shapes the generate route can emit (audit)", () => {
  it("cells that are objects (plausible LLM output) are rejected by the export schema", () => {
    const report = {
      title: "Nested cells",
      sections: [
        {
          id: "t1",
          type: "table",
          data: { headers: ["A"], rows: [[{ value: 1 }]] },
        },
      ],
    };
    expect(exportRequestSchema.safeParse({ report, format: "md" }).success).toBe(false);
  });

  it("drops a titleless null-content section and keeps a title-only one", () => {
    const report = {
      title: "Sparse",
      sections: [{ id: "s1", content: null }, { id: "s2", title: "Only title" }],
    };
    const parsed = exportRequestSchema.safeParse({ report, format: "md" });
    expect(parsed.success).toBe(true);
    const content = reportToStructuredContent(report as any);
    // Gap: an untitled empty section vanishes without a trace - if every
    // section looks like that, the exported file has only a title.
    expect(content.sections.map((s) => s.heading)).toEqual(["Only title"]);
  });

  it("a 80.1 MB-ish section count boundary is exact: 80 passes, 81 fails", () => {
    const mk = (n: number) => ({
      title: "Boundary",
      sections: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, content: "b" })),
    });
    expect(exportRequestSchema.safeParse({ report: mk(80), format: "md" }).success).toBe(true);
    expect(exportRequestSchema.safeParse({ report: mk(81), format: "md" }).success).toBe(false);
  });
});
