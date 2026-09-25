import { z } from "zod";
import { getDashboardStats, getMonthlyExpenseSummary, getMonthlyTrend, getApiKeyByUser } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { generateFile, STYLE_DEFINITIONS as ALL_STYLES } from "../fileGenerator";
import { generateDocumentContent } from "../llmProvider";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

async function generateExcel(
  entries: any[],
  monthLabel: string,
  summary: { total: number; byCategory: { category: string; amount: number }[] }
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sutaeru Business";
  workbook.created = new Date();

  // Sheet 1: Expense Entries
  const sheet = workbook.addWorksheet("Expenses");
  sheet.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Date", key: "date", width: 14 },
    { header: "Vendor", key: "vendor", width: 22 },
    { header: "Description", key: "description", width: 32 },
    { header: "Category", key: "category", width: 16 },
    { header: "Amount", key: "amount", width: 16 },
    { header: "Tax Amount", key: "taxAmount", width: 14 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Payment Method", key: "paymentMethod", width: 18 },
    { header: "Status", key: "status", width: 12 },
  ];
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 22;
  for (const e of entries) {
    sheet.addRow({
      id: e.id,
      date: e.date ? new Date(e.date).toISOString().split("T")[0] : "",
      vendor: e.vendor ?? "",
      description: e.description ?? "",
      category: e.category ?? "Uncategorized",
      amount: parseFloat(e.amount ?? "0"),
      taxAmount: parseFloat(e.taxAmount ?? "0"),
      currency: e.currency ?? "IDR",
      paymentMethod: e.paymentMethod ?? "",
      status: e.status ?? "",
    });
  }
  sheet.getColumn("amount").numFmt = "#,##0.00";
  sheet.getColumn("taxAmount").numFmt = "#,##0.00";
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowNumber % 2 === 0 ? "FFF0F4F8" : "FFFFFFFF" } };
    }
  });

  // Sheet 2: Summary
  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Category", key: "category", width: 24 },
    { header: "Total Amount", key: "amount", width: 18 },
    { header: "% of Total", key: "pct", width: 14 },
  ];
  const summaryHeader = summarySheet.getRow(1);
  summaryHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
  summaryHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  summaryHeader.height = 22;
  for (const cat of summary.byCategory) {
    summarySheet.addRow({
      category: cat.category,
      amount: cat.amount,
      pct: summary.total > 0 ? ((cat.amount / summary.total) * 100).toFixed(1) + "%" : "0%",
    });
  }
  const totalRow = summarySheet.addRow({ category: "TOTAL", amount: summary.total, pct: "100%" });
  totalRow.font = { bold: true };
  totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F4FD" } };
  summarySheet.getColumn("amount").numFmt = "#,##0.00";

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function generatePDFReport(
  entries: any[],
  monthLabel: string,
  summary: { total: number; byCategory: { category: string; amount: number }[] }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const currency = entries[0]?.currency ?? "IDR";
    // Header
    doc.rect(0, 0, doc.page.width, 80).fill("#1e3a5f");
    doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold").text("Sutaeru Business", 50, 22);
    doc.fontSize(11).font("Helvetica").text(`Expense Report — ${monthLabel}`, 50, 50);
    doc.fillColor("#1f2937");
    // Summary
    doc.moveDown(3);
    doc.fontSize(14).font("Helvetica-Bold").text("Summary", 50, doc.y);
    doc.moveDown(0.5);
    doc.fontSize(11).font("Helvetica");
    doc.text(`Total Receipts: ${entries.length}`, 50);
    doc.text(`Total Expenses: ${currency} ${summary.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    doc.moveDown(0.5);
    doc.fontSize(12).font("Helvetica-Bold").text("By Category:");
    doc.fontSize(10).font("Helvetica");
    for (const cat of summary.byCategory) {
      const pct = summary.total > 0 ? ((cat.amount / summary.total) * 100).toFixed(1) : "0.0";
      doc.text(`  • ${cat.category}: ${currency} ${cat.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} (${pct}%)`);
    }
    doc.moveDown(1.5);
    // Table
    doc.fontSize(14).font("Helvetica-Bold").text("Expense Entries");
    doc.moveDown(0.5);
    const tableTop = doc.y;
    const colWidths = [40, 70, 100, 80, 80, 70];
    const colX = [50, 90, 160, 260, 340, 420];
    const headers = ["ID", "Date", "Vendor", "Category", "Amount", "Status"];
    doc.rect(50, tableTop, doc.page.width - 100, 20).fill("#1e3a5f");
    doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold");
    headers.forEach((h, i) => { doc.text(h, colX[i], tableTop + 5, { width: colWidths[i] }); });
    doc.fillColor("#1f2937");
    let rowY = tableTop + 22;
    doc.fontSize(8).font("Helvetica");
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (rowY > doc.page.height - 80) { doc.addPage(); rowY = 50; }
      if (i % 2 === 0) { doc.rect(50, rowY - 2, doc.page.width - 100, 16).fill("#f0f4f8"); }
      doc.fillColor("#1f2937");
      doc.text(String(e.id), colX[0], rowY, { width: colWidths[0] });
      doc.text(e.date ? new Date(e.date).toISOString().split("T")[0] : "", colX[1], rowY, { width: colWidths[1] });
      doc.text((e.vendor ?? "").substring(0, 18), colX[2], rowY, { width: colWidths[2] });
      doc.text((e.category ?? "Uncategorized").substring(0, 14), colX[3], rowY, { width: colWidths[3] });
      doc.text(parseFloat(e.amount ?? "0").toLocaleString("en-US", { minimumFractionDigits: 2 }), colX[4], rowY, { width: colWidths[4] });
      doc.text(e.status ?? "", colX[5], rowY, { width: colWidths[5] });
      rowY += 16;
    }
    doc.fontSize(8).fillColor("#9ca3af").text(
      `Generated by Sutaeru Business on ${new Date().toISOString().split("T")[0]}`,
      50, doc.page.height - 40, { align: "center", width: doc.page.width - 100 }
    );
    doc.end();
  });
}

function generateCSV(entries: any[], month: string): string {
  const headers = ["ID", "Date", "Vendor", "Description", "Category", "Amount", "Tax Amount", "Currency", "Payment Method", "Status"];
  const rows = entries.map((e) => [
    e.id,
    e.date ? new Date(e.date).toISOString().split("T")[0] : "",
    e.vendor ?? "",
    e.description ?? "",
    e.category ?? "",
    e.amount ?? "0",
    e.taxAmount ?? "0",
    e.currency ?? "IDR",
    e.paymentMethod ?? "",
    e.status ?? "",
  ]);
  const csvLines = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))];
  return csvLines.join("\n");
}

const STYLE_DEFINITIONS = [
  { id: "minimal", label: "Minimal", colors: { primary: "#1a1a2e", secondary: "#e8e8e8", accent: "#4a90d9", background: "#ffffff", text: "#1a1a2e" }, fonts: { heading: "Helvetica", body: "Helvetica" } },
  { id: "corporate", label: "Corporate", colors: { primary: "#003366", secondary: "#f0f4f8", accent: "#0066cc", background: "#ffffff", text: "#1a1a2e" }, fonts: { heading: "Helvetica", body: "Helvetica" } },
];

export const reportsRouter = router({
  dashboardStats: protectedProcedure.query(async () => {
    return getDashboardStats();
  }),

  monthlySummary: protectedProcedure
    .input(z.object({ year: z.number(), month: z.number().min(1).max(12) }))
    .query(async ({ input }) => {
      return getMonthlyExpenseSummary(input.year, input.month);
    }),

  trend: protectedProcedure
    .input(z.object({ months: z.number().min(1).max(24).default(6) }))
    .query(async ({ input }) => {
      return getMonthlyTrend(input.months);
    }),

  // ── Task 10: Excel Export ─────────────────────────────────────────────────
  exportExcel: protectedProcedure
    .input(z.object({ year: z.number(), month: z.number().min(1).max(12) }))
    .mutation(async ({ input }) => {
      const summary = await getMonthlyExpenseSummary(input.year, input.month);
      const monthLabel = `${input.year}-${String(input.month).padStart(2, "0")}`;
      const buffer = await generateExcel(summary.entries, monthLabel, summary);
      const fileKey = `reports/export-${monthLabel}-${Date.now()}.xlsx`;
      const { url } = await storagePut(fileKey, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return {
        url,
        fileName: `expense-report-${monthLabel}.xlsx`,
        totalEntries: summary.entries.length,
        totalAmount: summary.total,
      };
    }),

  // ── Task 10: PDF Export ───────────────────────────────────────────────────
  exportPDF: protectedProcedure
    .input(z.object({ year: z.number(), month: z.number().min(1).max(12) }))
    .mutation(async ({ input }) => {
      const summary = await getMonthlyExpenseSummary(input.year, input.month);
      const monthLabel = `${input.year}-${String(input.month).padStart(2, "0")}`;
      const buffer = await generatePDFReport(summary.entries, monthLabel, summary);
      const fileKey = `reports/export-${monthLabel}-${Date.now()}.pdf`;
      const { url } = await storagePut(fileKey, buffer, "application/pdf");
      return {
        url,
        fileName: `expense-report-${monthLabel}.pdf`,
        totalEntries: summary.entries.length,
        totalAmount: summary.total,
      };
    }),

  exportCSV: protectedProcedure
    .input(z.object({ year: z.number(), month: z.number().min(1).max(12) }))
    .mutation(async ({ input }) => {
      const summary = await getMonthlyExpenseSummary(input.year, input.month);
      const monthLabel = `${input.year}-${String(input.month).padStart(2, "0")}`;
      const csv = generateCSV(summary.entries, monthLabel);
      const fileKey = `reports/export-${monthLabel}-${Date.now()}.csv`;
      const { url } = await storagePut(fileKey, Buffer.from(csv, "utf-8"), "text/csv");
      return {
        url,
        fileName: `expense-report-${monthLabel}.csv`,
        totalEntries: summary.entries.length,
        totalAmount: summary.total,
      };
    }),

  exportTaxDocument: protectedProcedure
    .input(z.object({
      month: z.number().min(1).max(12),
      year: z.number().min(2020).max(2030),
      format: z.enum(["pdf", "docx", "xlsx"]),
      styleId: z.string().default("corporate"),
    }))
    .mutation(async ({ ctx, input }) => {
      const summary = await getMonthlyExpenseSummary(input.year, input.month);
      const monthLabel = `${input.year}-${String(input.month).padStart(2, "0")}`;
      const currency = summary.entries[0]?.currency ?? "IDR";

      const categoryBreakdown = summary.byCategory
        .map((c) => `${c.category}: ${currency} ${c.amount.toLocaleString()}`)
        .join(", ");

      const prompt = `Generate a formal tax expense report for the period ${monthLabel}.
Total expenses: ${currency} ${summary.total.toLocaleString()}.
Number of receipts: ${summary.entries.length}.
Category breakdown: ${categoryBreakdown || "No expenses recorded"}.
Include: executive summary, itemized expense table with vendor/date/amount/category columns, category subtotals, tax summary section, and a declaration statement for tax filing purposes.`;

      const apiKeyRecord = await getApiKeyByUser(ctx.user.id);
      const style = STYLE_DEFINITIONS.find((s) => s.id === input.styleId) ?? STYLE_DEFINITIONS[1];
      const llmConfig = apiKeyRecord ? { provider: apiKeyRecord.provider as any, apiKey: apiKeyRecord.encryptedKey } : null;
      const content = await generateDocumentContent(prompt, input.format, style.label, llmConfig);
      const generated = await generateFile(content, input.format, style as any);

      const fileKey = `user-${ctx.user.id}/tax-reports/tax-${monthLabel}-${Date.now()}.${generated.extension}`;
      const { url } = await storagePut(fileKey, generated.buffer, generated.mimeType);

      return {
        url,
        fileName: `tax-report-${monthLabel}.${generated.extension}`,
        totalEntries: summary.entries.length,
        totalAmount: summary.total,
      };
    }),
});
