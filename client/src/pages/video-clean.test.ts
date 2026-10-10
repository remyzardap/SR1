import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/* The server's engine `label` is the vendor name (server/lib/fnVideo.ts VIDEO_ENGINE_LABELS:
   "Gemini", "OpenAI", "Qwen"). /video used to print it in six places. The page keeps its own
   id-keyed copy map, so nothing rendered may come from `label`. */
const page = readFileSync(new URL("./Video.tsx", import.meta.url), "utf8");
const VENDOR = /gemini|qwen|openai|claude|gpt|flux|kimi|anthropic|sora|veo|wan\b/i;

describe("/video engine names", () => {
  it("never renders the server label", () => {
    for (const leak of ["current.label", "?.label", "e.label", "{e.label", "name: e.label"]) {
      expect(page, leak).not.toContain(leak);
    }
  });

  it("draws every engine name from the id-keyed map", () => {
    expect(page).toContain("const engineName = (e: { id: string; label: string }) => ENGINE_NAMES[e.id]");
    expect((page.match(/engineName\(/g) ?? []).length).toBeGreaterThanOrEqual(7);
  });

  it("names the engines by character, not by vendor", () => {
    const map = page.match(/const ENGINE_NAMES[^=]*= \{([^}]*)\}/);
    expect(map).not.toBeNull();
    const names = [...map![1].matchAll(/\w+: "([^"]+)"/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThanOrEqual(4);
    for (const name of names) expect(name).not.toMatch(VENDOR);
    expect(names).toContain("GPU");
  });

  it("keeps the blurbs vendor-free too", () => {
    const blurbs = [...page.matchAll(/blurb: "([^"]+)"/g)].map((m) => m[1]);
    expect(blurbs.length).toBeGreaterThanOrEqual(4);
    for (const blurb of blurbs) expect(blurb).not.toMatch(VENDOR);
  });

  it("still says something sensible for an engine the page has never seen", () => {
    expect(page).toContain('ENGINE_NAMES[e.id] ?? "Engine"');
  });
});
