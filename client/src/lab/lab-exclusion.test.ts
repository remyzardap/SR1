import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

describe("Design Lab exclusion in production build", () => {
  const rootDir = path.resolve(__dirname, "../../..");
  const distDir = path.join(rootDir, "dist");

  function getAllFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...getAllFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }
    return files;
  }

  it("ensures production build dist/ exists and contains no lab routes or lab titles", () => {
    // If dist doesn't exist yet, run npm run build with default production settings
    if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, "public"))) {
      execSync("npm run build", {
        cwd: rootDir,
        env: {
          ...process.env,
          NODE_ENV: "production",
          VITE_DESIGN_LAB: "",
        },
        stdio: "pipe",
      });
    }

    const distFiles = getAllFiles(distDir);
    expect(distFiles.length).toBeGreaterThan(0);

    const targetExtensions = [".js", ".html", ".css", ".map"];
    const textFiles = distFiles.filter((f) =>
      targetExtensions.some((ext) => f.endsWith(ext))
    );

    expect(textFiles.length).toBeGreaterThan(0);

    const forbiddenStrings = ["__lab", "Design Lab"];

    for (const file of textFiles) {
      const content = fs.readFileSync(file, "utf8");
      for (const forbidden of forbiddenStrings) {
        expect(
          content.includes(forbidden),
          `Found forbidden string "${forbidden}" in production output ${path.relative(rootDir, file)}`
        ).toBe(false);
      }
    }
  });
});
