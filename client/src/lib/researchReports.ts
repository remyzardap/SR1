import { jsPDF } from "jspdf";

export interface ResearchSource {
  title: string;
  url: string;
}

export interface ResearchReport {
  question: string;
  answer: string;
  sources: ResearchSource[];
  createdAt: Date;
}

function safeName(question: string) {
  const stem = question.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48);
  return `sutaeru-research-${stem || "report"}`;
}

function markdown(report: ResearchReport) {
  const sources = report.sources.length
    ? report.sources.map((source, index) => `${index + 1}. [${source.title}](${source.url})`).join("\n")
    : "No external sources were returned.";
  return `# Research report\n\n**Question:** ${report.question}\n\n**Prepared:** ${report.createdAt.toLocaleString()}\n\n---\n\n${report.answer}\n\n## Sources\n\n${sources}\n`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadResearchMarkdown(report: ResearchReport) {
  download(new Blob([markdown(report)], { type: "text/markdown;charset=utf-8" }), `${safeName(report.question)}.md`);
}

export function downloadResearchPdf(report: ResearchReport) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 52;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const height = pdf.internal.pageSize.getHeight();
  let y = margin;
  const addText = (text: string, size: number, gap: number) => {
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, width) as string[];
    for (const line of lines) {
      if (y > height - margin) { pdf.addPage(); y = margin; }
      pdf.text(line, margin, y);
      y += size * 1.45;
    }
    y += gap;
  };
  pdf.setFont("helvetica", "bold");
  addText("Sutaeru Research Report", 20, 12);
  pdf.setFont("helvetica", "normal");
  addText(`Question: ${report.question}`, 11, 8);
  addText(`Prepared: ${report.createdAt.toLocaleString()}`, 9, 18);
  addText(report.answer.replace(/[#*_`>]/g, ""), 10, 18);
  pdf.setFont("helvetica", "bold");
  addText("Sources", 14, 8);
  pdf.setFont("helvetica", "normal");
  report.sources.forEach((source, index) => addText(`${index + 1}. ${source.title}\n${source.url}`, 9, 7));
  pdf.save(`${safeName(report.question)}.pdf`);
}