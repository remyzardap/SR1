import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { exportAtelierReport, exportRequestSchema, MAX_REPORT_BYTES, reportByteSize, reportToStructuredContent, type AtelierReportInput } from "./atelierExport";

const ABSTRACT = "This study examines heat pump adoption (Smith, 2020) and finds uptake rose sharply.";
const REFS = [
  "Smith, J. (2020). Heat pumps at home. Journal of Energy, 12(3), 45-67. https://example.org/smith",
  "Lee, A., & Park, B. (2021). Cold climate performance. Energy Letters, 9, 1-10.",
  "[3] Garcia, M. (2019). Retrofit costs. Building Review, 4(2), 22-30.",
].join("\n");

const report = (style?: string): AtelierReportInput => ({
  title: "Heat Pump Adoption",
  theme: "editorial",
  sections: [
    { id: "abs", type: "abstract", title: "Abstract", content: ABSTRACT },
    { id: "intro", type: "section", title: "Introduction", content: "Adoption is rising [1] and costs are falling (Lee & Park, 2021)." },
    { id: "refs", type: "references", title: "References", content: REFS, style },
  ],
});

/** Plain text of every FlateDecode stream: pdfkit writes shown text as hex strings in TJ arrays. */
function pdfText(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const out: string[] = [];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
    } catch {
      continue;
    }
    for (const array of content.matchAll(/\[((?:<[0-9a-f]*>|\s|-?[\d.]+)*)\]\s*TJ/gi)) {
      out.push([...array[1].matchAll(/<([0-9a-f]*)>/gi)].map((h) => Buffer.from(h[1], "hex").toString("latin1")).join(""));
    }
  }
  return out.join("\n");
}

async function docxXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file("word/document.xml")!.async("string");
}
const plain = (xml: string) => xml.replace(/<w:tab\/>/g, "\t").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");

describe("schema", () => {
  it("accepts abstract and references sections with a style and keeps every old type valid", () => {
    const parsed = exportRequestSchema.safeParse({ report: report("ieee"), format: "pdf" });
    expect(parsed.success).toBe(true);
    for (const type of ["cover", "summary", "section", "table", "chart", "image", undefined]) {
      expect(exportRequestSchema.safeParse({ report: { sections: [{ type, content: "x" }] }, format: "md" }).success).toBe(true);
    }
    expect(exportRequestSchema.safeParse({ report: { sections: [{ type: "references", style: "x".repeat(40) }] }, format: "md" }).success).toBe(false);
  });

  it("keeps the byte guard", () => {
    expect(reportByteSize({ sections: [{ content: "x".repeat(MAX_REPORT_BYTES) }] })).toBeGreaterThan(MAX_REPORT_BYTES);
  });
});

describe("reportToStructuredContent", () => {
  it("maps abstract and references, strips list labels and keeps citation markers as plain text", () => {
    const content = reportToStructuredContent(report("apa"));
    expect(content.sections[0]).toMatchObject({ heading: "Abstract", kind: "abstract", body: ABSTRACT });
    expect(content.sections[1].body).toContain("[1]");
    expect(content.sections[1].body).toContain("(Lee & Park, 2021)");
    const refs = content.sections[2];
    expect(refs.kind).toBe("references");
    expect(refs.numbered).toBe(false);
    expect(refs.items).toHaveLength(3);
    expect(refs.items![2]).toBe("Garcia, M. (2019). Retrofit costs. Building Review, 4(2), 22-30.");
    expect(reportToStructuredContent(report("IEEE")).sections[2].numbered).toBe(true);
  });

  it("drops empty abstract and reference sections", () => {
    const content = reportToStructuredContent({ sections: [{ type: "abstract", content: " " }, { type: "references", content: "\n\n" }, { type: "section", title: "Body", content: "text" }] });
    expect(content.sections.map((s) => s.heading)).toEqual(["Body"]);
  });
});

describe("export round trips", () => {
  it("markdown: abstract block and hanging-style references", async () => {
    const { file } = await exportAtelierReport(report("apa"), "md", "editorial");
    const md = file.buffer.toString("utf-8");
    expect(md).toContain("> **Abstract**");
    expect(md).toContain(`> ${ABSTRACT}`);
    expect(md).toContain("## References");
    expect(md).toContain("Smith, J. (2020). Heat pumps at home.");
    expect(md).not.toMatch(/^1\. Smith/m);
    expect(md).toContain("(Lee & Park, 2021)");
    expect(md).toContain("[1]");
  });

  it("markdown: numbered references for ieee, without doubled labels", async () => {
    const { file } = await exportAtelierReport(report("ieee"), "md", "editorial");
    const md = file.buffer.toString("utf-8");
    expect(md).toMatch(/^1\. Smith, J\. \(2020\)/m);
    expect(md).toMatch(/^3\. Garcia, M\. \(2019\)/m);
    expect(md).not.toContain("3. [3]");
  });

  it("docx: abstract block, hanging indent for apa, numbered for ieee", async () => {
    const apa = await docxXml((await exportAtelierReport(report("apa"), "docx", "editorial")).file.buffer);
    const apaText = plain(apa);
    expect(apaText).toContain("Abstract");
    expect(apaText).toContain(ABSTRACT);
    expect(apaText).toContain("References");
    expect(apaText).toContain("Lee, A., & Park, B. (2021). Cold climate performance.");
    expect(apa).toContain("w:hanging=");
    expect(apa).toContain("<w:shd");
    expect(apaText).not.toContain("[1]\tSmith");

    const ieee = plain(await docxXml((await exportAtelierReport(report("ieee"), "docx", "editorial")).file.buffer));
    expect(ieee).toContain("[1]\tSmith, J. (2020)");
    expect(ieee).toContain("[3]\tGarcia, M. (2019)");
  });

  it("pdf: abstract and references text are present, in order", async () => {
    for (const style of ["apa", "mla", "harvard", "ieee"]) {
      const { file } = await exportAtelierReport(report(style), "pdf", "editorial");
      expect(file.buffer.subarray(0, 4).toString()).toBe("%PDF");
      const text = pdfText(file.buffer);
      expect(text).toContain("Abstract");
      expect(text).toContain("heat pump adoption (Smith, 2020)");
      expect(text).toContain("References");
      expect(text).toContain("Cold climate performance");
      expect(text.indexOf("Abstract")).toBeLessThan(text.indexOf("Introduction"));
      expect(text.indexOf("Introduction")).toBeLessThan(text.indexOf("References"));
      if (style === "ieee") expect(text).toContain("[3]");
      else expect(text).not.toContain("[3]");
    }
  });

  it("pdf: a long reference list flows over pages without dropping entries", async () => {
    const many = Array.from({ length: 120 }, (_, i) => `Author${i}, A. (2020). Title number ${i} of a long list. Journal ${i}, 1(1), 1-9.`).join("\n");
    const { file } = await exportAtelierReport({ sections: [{ type: "references", title: "References", content: many, style: "apa" }] }, "pdf", "corporate");
    const text = pdfText(file.buffer);
    expect(text).toContain("Title number 0 ");
    expect(text).toContain("Title number 119 ");
  });

  it("xlsx: a references sheet next to the summary, other types still export", async () => {
    const withTable: AtelierReportInput = {
      ...report("apa"),
      sections: [...report("apa").sections, { id: "t", type: "table", title: "Costs", data: { headers: ["Type", "Cost"], rows: [["Air", "9000"]] } }],
    };
    const { file } = await exportAtelierReport(withTable, "xlsx", "editorial");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((w) => w.name)).toEqual(["Summary", "References", "Costs"]);
    const refs = workbook.getWorksheet("References")!;
    expect(refs.getRow(1).values).toEqual([undefined, "#", "Reference"]);
    expect(refs.getRow(2).getCell(2).value).toContain("Smith, J. (2020)");
    expect(refs.rowCount).toBe(4);
    const summary = workbook.getWorksheet("Summary")!;
    const cells: string[] = [];
    summary.eachRow((row) => cells.push(String(row.getCell(1).value ?? "")));
    expect(cells).toContain("Abstract");
    expect(cells).toContain(ABSTRACT);
  });
});
