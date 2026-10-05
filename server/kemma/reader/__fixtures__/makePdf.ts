/** Minimal single/multi-page PDF builder for tests, with no external dependency. */
export function makeTestPdf(pagesText: string[]): Buffer {
  const objs: string[] = [];
  objs.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  const kids = pagesText.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  objs.push(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pagesText.length} >>\nendobj\n`);

  pagesText.forEach((text, i) => {
    const pageNum = 3 + i * 2;
    const contentNum = pageNum + 1;
    objs.push(
      `${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /MediaBox [0 0 612 792] /Contents ${contentNum} 0 R >>\nendobj\n`
    );
    const escaped = text.replace(/[()\\]/g, (c) => "\\" + c);
    const stream = `BT /F1 24 Tf 72 700 Td (${escaped}) Tj ET`;
    objs.push(`${contentNum} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const obj of objs) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefOffset = pdf.length;
  const n = objs.length + 1;
  pdf += `xref\n0 ${n}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += String(off).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
