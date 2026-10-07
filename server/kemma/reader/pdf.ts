/**
 * PDF text extraction via `unpdf` (a pure-JS pdf.js build, no native step — safe on the
 * node:20-alpine production image). Text comes back per page; pages are concatenated with an
 * explicit page-break marker so the model can tell where one page ends and the next begins.
 */

import { getDocumentProxy, extractText } from "unpdf";

export interface ExtractedPdf {
  markdown: string;
  pages: number;
}

const PAGE_BREAK = "\n\n--- page break ---\n\n";

/** Extracts text from a PDF buffer, page by page. Throws on a corrupt or unreadable PDF. */
export async function extractPdf(buffer: Uint8Array): Promise<ExtractedPdf> {
  const pdf = await getDocumentProxy(buffer);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [String(text)];
  const markdown = pages.map((page) => page.trim()).join(PAGE_BREAK).trim();
  return { markdown, pages: totalPages };
}
