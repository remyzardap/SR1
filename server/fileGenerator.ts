import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, TabStopType } from "docx";
import ExcelJS from "exceljs";
import PptxGenJS from "pptxgenjs";
import PDFDocument from "pdfkit";

export type FileFormat = "pdf" | "docx" | "xlsx" | "pptx" | "md";

export interface StyleOption {
  id: string;
  label: string;
  description: string;
  primaryColor: string;
  accentColor: string;
  fontStyle: "serif" | "sans-serif" | "monospace";
  layout: "minimal" | "structured" | "creative" | "corporate" | "bold";
}

export interface GeneratedFile {
  buffer: Buffer;
  mimeType: string;
  extension: string;
}

// ─── Style definitions ────────────────────────────────────────────────────────

export const STYLE_DEFINITIONS: StyleOption[] = [
  {
    id: "minimal",
    label: "Minimal Clean",
    description: "White space, light typography, no decorations",
    primaryColor: "#1a1a1a",
    accentColor: "#6366f1",
    fontStyle: "sans-serif",
    layout: "minimal",
  },
  {
    id: "corporate",
    label: "Corporate Professional",
    description: "Navy blue headers, structured sections, business-ready",
    primaryColor: "#1e3a5f",
    accentColor: "#2563eb",
    fontStyle: "sans-serif",
    layout: "corporate",
  },
  {
    id: "creative",
    label: "Creative Bold",
    description: "Vibrant accents, expressive headings, modern feel",
    primaryColor: "#7c3aed",
    accentColor: "#f59e0b",
    fontStyle: "sans-serif",
    layout: "creative",
  },
  {
    id: "serif-classic",
    label: "Classic Editorial",
    description: "Serif fonts, editorial layout, timeless elegance",
    primaryColor: "#292524",
    accentColor: "#b45309",
    fontStyle: "serif",
    layout: "structured",
  },
  {
    id: "dark-tech",
    label: "Dark Technical",
    description: "Dark background, monospace code-like aesthetic",
    primaryColor: "#e2e8f0",
    accentColor: "#22d3ee",
    fontStyle: "monospace",
    layout: "bold",
  },
];

// ─── Structured content type ──────────────────────────────────────────────────

export interface StructuredContent {
  title: string;
  subtitle?: string;
  sections: Array<{
    heading: string;
    body: string;
    bullets?: string[];
    tableData?: { headers: string[]; rows: string[][] };
    /** Academic blocks: an abstract is set off from the text, references are a list of entries. */
    kind?: "abstract" | "references";
    /** References only: one formatted entry per item. */
    items?: string[];
    /** References only: true renders [1], [2] labels (IEEE), false a hanging indent (APA, MLA, Harvard). */
    numbered?: boolean;
  }>;
  summary?: string;
}

// ─── PDF Generator ────────────────────────────────────────────────────────────

export async function generatePDF(
  content: StructuredContent,
  style: StyleOption
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 60, size: "A4" });
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const isDark = style.layout === "bold";
    if (isDark) {
      doc.rect(0, 0, doc.page.width, doc.page.height).fill("#0f172a");
    }

    const textColor = isDark ? "#e2e8f0" : style.primaryColor;
    const accentColor = style.accentColor;

    // Title block
    doc.rect(0, 0, doc.page.width, 120).fill(isDark ? "#1e293b" : accentColor);
    doc
      .fillColor("#ffffff")
      .fontSize(28)
      .font(style.fontStyle === "serif" ? "Times-Bold" : "Helvetica-Bold")
      .text(content.title, 60, 35, { width: doc.page.width - 120 });
    if (content.subtitle) {
      doc.fontSize(13).font("Helvetica").text(content.subtitle, 60, 80, {
        width: doc.page.width - 120,
      });
    }

    doc.moveDown(4);

    for (const section of content.sections) {
      if (section.kind === "abstract") {
        const boxWidth = doc.page.width - 120;
        const innerWidth = boxWidth - 28;
        const bodyFont = style.fontStyle === "serif" ? "Times-Roman" : "Helvetica";
        doc.font(bodyFont).fontSize(10.5);
        const textHeight = doc.heightOfString(section.body, { width: innerWidth, align: "justify" });
        const boxHeight = textHeight + 44;
        if (doc.y + boxHeight > doc.page.height - 60) doc.addPage();
        const top = doc.y;
        doc.rect(60, top, boxWidth, boxHeight).fill(isDark ? "#1e293b" : "#f1f5f9");
        doc.rect(60, top, 4, boxHeight).fill(accentColor);
        doc
          .fillColor(accentColor)
          .fontSize(11)
          .font(style.fontStyle === "serif" ? "Times-Bold" : "Helvetica-Bold")
          .text(section.heading || "Abstract", 78, top + 12, { width: innerWidth });
        doc
          .fillColor(textColor)
          .fontSize(10.5)
          .font(bodyFont)
          .text(section.body, 78, top + 30, { width: innerWidth, align: "justify" });
        doc.x = 60;
        doc.y = top + boxHeight + 16;
        continue;
      }

      // Section heading
      doc
        .fillColor(isDark ? accentColor : accentColor)
        .fontSize(14)
        .font(style.fontStyle === "serif" ? "Times-Bold" : "Helvetica-Bold")
        .text(section.heading, { underline: false });

      doc
        .moveTo(60, doc.y + 2)
        .lineTo(doc.page.width - 60, doc.y + 2)
        .strokeColor(accentColor)
        .lineWidth(1)
        .stroke();

      doc.moveDown(0.5);

      if (section.kind === "references" && section.items && section.items.length > 0) {
        const entryWidth = doc.page.width - 120;
        const labelWidth = 30;
        const hang = 18;
        doc.fillColor(textColor).fontSize(10.5).font(style.fontStyle === "serif" ? "Times-Roman" : "Helvetica");
        section.items.forEach((entry, i) => {
          if (section.numbered) {
            const top = doc.y;
            doc.text(`[${i + 1}]`, 60, top, { width: labelWidth, lineBreak: false });
            doc.text(entry, 60 + labelWidth, top, { width: entryWidth - labelWidth, align: "left" });
          } else {
            doc.text(entry, 60 + hang, undefined, { width: entryWidth - hang, indent: -hang, align: "left" });
          }
          doc.x = 60;
          doc.moveDown(0.4);
        });
        doc.moveDown(1.5);
        continue;
      }

      // Body text
      doc
        .fillColor(textColor)
        .fontSize(11)
        .font(style.fontStyle === "serif" ? "Times-Roman" : "Helvetica")
        .text(section.body, { align: "justify" });

      // Bullets
      if (section.bullets && section.bullets.length > 0) {
        doc.moveDown(0.3);
        for (const bullet of section.bullets) {
          doc
            .fillColor(accentColor)
            .text("•  ", { continued: true })
            .fillColor(textColor)
            .text(bullet);
        }
      }

      // Table
      if (section.tableData) {
        doc.moveDown(0.5);
        const { headers, rows } = section.tableData;
        const colWidth = (doc.page.width - 120) / headers.length;
        const startX = 60;
        let y = doc.y;

        // Header row
        doc.rect(startX, y, doc.page.width - 120, 22).fill(accentColor);
        headers.forEach((h, i) => {
          doc
            .fillColor("#ffffff")
            .fontSize(10)
            .font("Helvetica-Bold")
            .text(h, startX + i * colWidth + 4, y + 6, { width: colWidth - 8 });
        });
        y += 22;

        // Data rows
        rows.forEach((row, ri) => {
          const rowColor = isDark
            ? ri % 2 === 0
              ? "#1e293b"
              : "#0f172a"
            : ri % 2 === 0
            ? "#f8fafc"
            : "#ffffff";
          doc.rect(startX, y, doc.page.width - 120, 20).fill(rowColor);
          row.forEach((cell, ci) => {
            doc
              .fillColor(textColor)
              .fontSize(10)
              .font("Helvetica")
              .text(cell, startX + ci * colWidth + 4, y + 5, {
                width: colWidth - 8,
              });
          });
          y += 20;
        });
        doc.y = y + 8;
      }

      doc.moveDown(1.5);
    }

    if (content.summary) {
      doc
        .rect(60, doc.y, doc.page.width - 120, 2)
        .fill(accentColor);
      doc.moveDown(0.5);
      doc
        .fillColor(textColor)
        .fontSize(11)
        .font(style.fontStyle === "serif" ? "Times-Italic" : "Helvetica-Oblique")
        .text(content.summary, { align: "center" });
    }

    doc.end();
  });
}

// ─── DOCX Generator ──────────────────────────────────────────────────────────

export async function generateDOCX(
  content: StructuredContent,
  style: StyleOption
): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      text: content.title,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
    })
  );

  if (content.subtitle) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: content.subtitle, italics: true, size: 26 })],
        alignment: AlignmentType.CENTER,
      })
    );
  }

  children.push(new Paragraph({ text: "" }));

  for (const section of content.sections) {
    if (section.kind === "abstract") {
      const accent = style.accentColor.replace("#", "");
      const block = {
        shading: { fill: "F1F5F9" },
        border: { left: { style: BorderStyle.SINGLE, size: 24, space: 8, color: accent } },
        indent: { left: 200, right: 200 },
      };
      children.push(
        new Paragraph({
          ...block,
          spacing: { before: 120, after: 0 },
          children: [new TextRun({ text: section.heading || "Abstract", bold: true, color: accent })],
        })
      );
      children.push(
        new Paragraph({ ...block, spacing: { after: 160 }, alignment: AlignmentType.JUSTIFIED, children: [new TextRun({ text: section.body })] })
      );
      continue;
    }

    children.push(
      new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_2 })
    );

    if (section.kind === "references" && section.items && section.items.length > 0) {
      section.items.forEach((entry, i) => {
        if (section.numbered) {
          children.push(
            new Paragraph({
              tabStops: [{ type: TabStopType.LEFT, position: 600 }],
              indent: { left: 600, hanging: 600 },
              spacing: { after: 80 },
              children: [new TextRun({ text: `[${i + 1}]\t${entry}` })],
            })
          );
        } else {
          children.push(
            new Paragraph({ indent: { left: 720, hanging: 720 }, spacing: { after: 80 }, children: [new TextRun({ text: entry })] })
          );
        }
      });
      children.push(new Paragraph({ text: "" }));
      continue;
    }

    children.push(new Paragraph({ text: section.body }));

    if (section.bullets) {
      for (const bullet of section.bullets) {
        children.push(
          new Paragraph({
            text: bullet,
            bullet: { level: 0 },
          })
        );
      }
    }
    children.push(new Paragraph({ text: "" }));
  }

  if (content.summary) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: content.summary, italics: true })],
      })
    );
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

// ─── XLSX Generator ──────────────────────────────────────────────────────────

export async function generateXLSX(
  content: StructuredContent,
  style: StyleOption
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sutaeru";
  workbook.created = new Date();

  const accentHex = style.accentColor.replace("#", "");
  const primaryHex = style.primaryColor.replace("#", "");

  // Summary sheet
  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.mergeCells("A1:D1");
  const titleCell = summarySheet.getCell("A1");
  titleCell.value = content.title;
  titleCell.font = { bold: true, size: 18, color: { argb: "FF" + accentHex } };
  titleCell.alignment = { horizontal: "center" };

  if (content.subtitle) {
    summarySheet.mergeCells("A2:D2");
    const subCell = summarySheet.getCell("A2");
    subCell.value = content.subtitle;
    subCell.font = { italic: true, size: 12 };
    subCell.alignment = { horizontal: "center" };
  }

  let row = 4;
  for (const section of content.sections) {
    summarySheet.getCell(`A${row}`).value = section.heading;
    summarySheet.getCell(`A${row}`).font = {
      bold: true,
      size: 13,
      color: { argb: "FF" + primaryHex },
    };
    row++;
    summarySheet.getCell(`A${row}`).value = section.body;
    summarySheet.getCell(`A${row}`).alignment = { wrapText: true };
    summarySheet.getRow(row).height = 60;
    row++;

    if (section.bullets) {
      for (const bullet of section.bullets) {
        summarySheet.getCell(`A${row}`).value = `• ${bullet}`;
        row++;
      }
    }

    const sheetTable =
      section.tableData ??
      (section.kind === "references" && section.items && section.items.length > 0
        ? { headers: ["#", "Reference"], rows: section.items.map((entry, i) => [String(i + 1), entry]) }
        : undefined);
    if (sheetTable) {
      const ws = workbook.addWorksheet(section.heading.substring(0, 31));
      const headerRow = ws.addRow(sheetTable.headers);
      headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + accentHex } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.border = {
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
      for (const dataRow of sheetTable.rows) {
        ws.addRow(dataRow);
      }
      ws.columns.forEach((col) => { col.width = 20; });
      if (!section.tableData) {
        ws.getColumn(1).width = 6;
        ws.getColumn(2).width = 110;
        ws.getColumn(2).alignment = { wrapText: true, vertical: "top" };
      }
    }

    row++;
  }

  summarySheet.getColumn("A").width = 80;

  const xlsxBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(xlsxBuffer);
}

// ─── PPTX Generator ──────────────────────────────────────────────────────────

export async function generatePPTX(
  content: StructuredContent,
  style: StyleOption
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";

  const accent = style.accentColor;
  const primary = style.primaryColor;
  const isDark = style.layout === "bold";
  const bgColor = isDark ? "0f172a" : "ffffff";
  const textColor = isDark ? "e2e8f0" : primary.replace("#", "");

  // Title slide
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: accent.replace("#", "") };
  titleSlide.addText(content.title, {
    x: 0.5, y: 1.5, w: "90%", h: 1.5,
    fontSize: 40, bold: true, color: "FFFFFF", align: "center",
  });
  if (content.subtitle) {
    titleSlide.addText(content.subtitle, {
      x: 0.5, y: 3.2, w: "90%", h: 0.8,
      fontSize: 20, color: "FFFFFF", align: "center", italic: true,
    });
  }

  // Content slides
  for (const section of content.sections) {
    const slide = pptx.addSlide();
    slide.background = { color: bgColor };

    // Heading bar
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: "100%", h: 1.1,
      fill: { color: accent.replace("#", "") },
    });
    slide.addText(section.heading, {
      x: 0.4, y: 0.15, w: "90%", h: 0.8,
      fontSize: 22, bold: true, color: "FFFFFF",
    });

    let bodyY = 1.3;

    if (section.body) {
      slide.addText(section.body, {
        x: 0.4, y: bodyY, w: "90%", h: 1.2,
        fontSize: 14, color: textColor, wrap: true,
      });
      bodyY += 1.4;
    }

    if (section.bullets && section.bullets.length > 0) {
      const bulletText = section.bullets.map((b) => ({ text: `• ${b}`, options: { bullet: false } }));
      slide.addText(bulletText, {
        x: 0.4, y: bodyY, w: "90%", h: 3,
        fontSize: 13, color: textColor, valign: "top",
      });
    }

    if (section.tableData) {
      const { headers, rows } = section.tableData;
      const tableRows = [
        headers.map((h) => ({
          text: h,
          options: { bold: true, color: "FFFFFF", fill: { color: accent.replace("#", "") } },
        })),
        ...rows.map((row) =>
          row.map((cell) => ({ text: cell, options: { color: textColor } }))
        ),
      ];
      slide.addTable(tableRows, {
        x: 0.4, y: bodyY, w: 9, colW: Array(headers.length).fill(9 / headers.length),
        fontSize: 11, border: { pt: 1, color: "cccccc" },
      });
    }
  }

  // Summary slide
  if (content.summary) {
    const summarySlide = pptx.addSlide();
    summarySlide.background = { color: isDark ? "1e293b" : "f8fafc" };
    summarySlide.addText("Summary", {
      x: 0.5, y: 0.3, w: "90%", h: 0.7,
      fontSize: 28, bold: true, color: accent.replace("#", ""),
    });
    summarySlide.addText(content.summary, {
      x: 0.5, y: 1.2, w: "90%", h: 4,
      fontSize: 16, color: textColor, italic: true, align: "center", valign: "middle",
    });
  }

  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(buffer as ArrayBuffer);
}

// ─── Markdown Generator ───────────────────────────────────────────────────────

export function generateMarkdown(content: StructuredContent): Buffer {
  const lines: string[] = [];
  lines.push(`# ${content.title}`);
  if (content.subtitle) lines.push(`\n> ${content.subtitle}`);
  lines.push("");

  for (const section of content.sections) {
    if (section.kind === "abstract") {
      lines.push(`> **${section.heading || "Abstract"}**`);
      lines.push(">");
      for (const paragraph of section.body.split(/\n{2,}/)) {
        lines.push(`> ${paragraph.replace(/\n/g, " ")}`);
        lines.push(">");
      }
      lines.pop();
      lines.push("");
      continue;
    }

    lines.push(`## ${section.heading}`);
    lines.push("");

    if (section.kind === "references" && section.items && section.items.length > 0) {
      section.items.forEach((entry, i) => {
        // Markdown has no hanging indent: numbered entries use a list, the rest are paragraphs.
        lines.push(section.numbered ? `${i + 1}. ${entry}` : entry);
        if (!section.numbered) lines.push("");
      });
      lines.push("");
      continue;
    }

    lines.push(section.body);
    lines.push("");

    if (section.bullets && section.bullets.length > 0) {
      for (const bullet of section.bullets) {
        lines.push(`- ${bullet}`);
      }
      lines.push("");
    }

    if (section.tableData) {
      const { headers, rows } = section.tableData;
      lines.push(`| ${headers.join(" | ")} |`);
      lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
      for (const row of rows) {
        lines.push(`| ${row.join(" | ")} |`);
      }
      lines.push("");
    }
  }

  if (content.summary) {
    lines.push("---");
    lines.push("");
    lines.push(`*${content.summary}*`);
  }

  return Buffer.from(lines.join("\n"), "utf-8");
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export async function generateFile(
  content: StructuredContent,
  format: FileFormat,
  style: StyleOption
): Promise<GeneratedFile> {
  switch (format) {
    case "pdf": {
      const buffer = await generatePDF(content, style);
      return { buffer, mimeType: "application/pdf", extension: "pdf" };
    }
    case "docx": {
      const buffer = await generateDOCX(content, style);
      return {
        buffer,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        extension: "docx",
      };
    }
    case "xlsx": {
      const buffer = await generateXLSX(content, style);
      return {
        buffer,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        extension: "xlsx",
      };
    }
    case "pptx": {
      const buffer = await generatePPTX(content, style);
      return {
        buffer,
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        extension: "pptx",
      };
    }
    case "md": {
      const buffer = generateMarkdown(content);
      return { buffer, mimeType: "text/markdown", extension: "md" };
    }
  }
}
