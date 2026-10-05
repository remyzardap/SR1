import { describe, it, expect } from "vitest";
import { extractPdf } from "./pdf";
import { makeTestPdf } from "./__fixtures__/makePdf";

describe("extractPdf", () => {
  it("extracts text from a single-page PDF", async () => {
    const pdf = makeTestPdf(["Hello from a single page PDF fixture."]);
    const result = await extractPdf(new Uint8Array(pdf));
    expect(result.pages).toBe(1);
    expect(result.markdown).toContain("Hello from a single page PDF fixture");
  });

  it("extracts text from multiple pages with a page break noted between them", async () => {
    const pdf = makeTestPdf(["First page content here.", "Second page has different text."]);
    const result = await extractPdf(new Uint8Array(pdf));
    expect(result.pages).toBe(2);
    expect(result.markdown).toContain("First page content here.");
    expect(result.markdown).toContain("Second page has different text.");
    expect(result.markdown).toContain("page break");
    // The break should actually separate the two pages, not just appear somewhere.
    const breakIndex = result.markdown.indexOf("page break");
    expect(result.markdown.indexOf("First page")).toBeLessThan(breakIndex);
    expect(result.markdown.indexOf("Second page")).toBeGreaterThan(breakIndex);
  });

  it("rejects a buffer that is not a PDF", async () => {
    await expect(extractPdf(new TextEncoder().encode("not a pdf at all"))).rejects.toThrow();
  });
});
