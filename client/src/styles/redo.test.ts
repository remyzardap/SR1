import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Redo stylesheets and tokens", () => {
  const stylesDir = path.resolve(__dirname);
  const redoDir = path.join(stylesDir, "redo");
  const indexPath = path.join(redoDir, "index.css");
  const tokensPath = path.join(stylesDir, "reskin-tokens.css");

  it("all imported redo files exist and are non-empty", () => {
    expect(fs.existsSync(indexPath)).toBe(true);
    const indexContent = fs.readFileSync(indexPath, "utf8");
    const importLines = indexContent
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.startsWith("@import"));

    expect(importLines.length).toBeGreaterThanOrEqual(16);

    for (const importLine of importLines) {
      const match = importLine.match(/@import\s+["'](\.\/[^"']+)["'];/);
      expect(match).not.toBeNull();
      const relativeFile = match![1];
      const filePath = path.resolve(redoDir, relativeFile);
      expect(fs.existsSync(filePath), `Expected ${relativeFile} to exist`).toBe(true);
      const stat = fs.statSync(filePath);
      expect(stat.size, `Expected ${relativeFile} to be non-empty`).toBeGreaterThan(0);
    }
  });

  it("token definitions in reskin-tokens.css include required tokens", () => {
    expect(fs.existsSync(tokensPath)).toBe(true);
    const tokensContent = fs.readFileSync(tokensPath, "utf8");
    const requiredTokens = [
      "--font-sans",
      "--mono",
      "--disp",
      "--body",
      "--ease",
      "--grain",
    ];

    for (const token of requiredTokens) {
      const tokenRegex = new RegExp(`${token}\\s*:`, "i");
      expect(tokensContent, `Expected token ${token} to be defined in reskin-tokens.css`).toMatch(tokenRegex);
    }
  });

  it("key redo selectors are present across ported stylesheets", () => {
    const requiredSelectors = [
      ".intro",
      ".glyph",
      ".top",
      ".seg",
      ".home",
      ".answer-grid",
      ".studio-grid",
      ".result",
      ".dp",
      ".sheet",
    ];

    // Read all files in redo/ and combine contents
    const redoFiles = fs.readdirSync(redoDir).filter(f => f.endsWith(".css"));
    const bundleContent = redoFiles.map(f => fs.readFileSync(path.join(redoDir, f), "utf8")).join("\n");

    for (const sel of requiredSelectors) {
      // Escape for regex
      const escaped = sel.replace(/\./g, "\\.");
      const regex = new RegExp(`(?:^|[\\s,{>;])${escaped}(?:[\\s,:>{]|$)`, "m");
      expect(bundleContent, `Expected selector ${sel} to be present in redo CSS`).toMatch(regex);
    }
  });

  it("shared card class includes hairline top highlight (.7 light, .04 dark)", () => {
    const baseCssPath = path.join(redoDir, "base.css");
    expect(fs.existsSync(baseCssPath)).toBe(true);
    const baseContent = fs.readFileSync(baseCssPath, "utf8");

    // Light mode highlight
    expect(baseContent).toMatch(/inset\s+0\s+1px\s+0\s+rgba\(255,\s*255,\s*255,\s*\.?7\)/);
    // Dark mode highlight
    expect(baseContent).toMatch(/inset\s+0\s+1px\s+0\s+rgba\(255,\s*255,\s*255,\s*\.?04\)/);
  });
});
