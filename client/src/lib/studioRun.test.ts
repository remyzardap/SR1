import { describe, expect, it } from "vitest";

import { DEFAULT_SHOT } from "./studio";
import { engineBrief, estimate, labelFromPrompt, phaseOf, suggestEngine } from "./studioRun";

describe("labelFromPrompt", () => {
  it("takes the first quoted words, upper-cased", () => {
    expect(labelFromPrompt('A mug that says "Sutaeru" on it')).toBe("SUTAERU");
    expect(labelFromPrompt("A plain mug")).toBe("");
  });
});

describe("suggestEngine", () => {
  const all = ["gemini", "openai", "qwen"] as const;
  it("sends quoted words to Gemini", () => {
    expect(suggestEngine(DEFAULT_SHOT, "HELLO", [...all]).id).toBe("gemini");
  });
  it("sends moody light to OpenAI and natural detail to Wan", () => {
    expect(suggestEngine({ ...DEFAULT_SHOT, light: "night" }, "", [...all]).id).toBe("openai");
    expect(suggestEngine(DEFAULT_SHOT, "", [...all]).id).toBe("qwen");
  });
  it("falls back to an engine that is available", () => {
    expect(suggestEngine(DEFAULT_SHOT, "", ["gemini"]).id).toBe("gemini");
  });
});

describe("estimate and brief", () => {
  it("doubles credits for high quality and scales with the count", () => {
    expect(estimate("qwen", "standard", 1)).toEqual({ credits: 2, secs: 18 });
    expect(estimate("qwen", "high", 2).credits).toBe(8);
  });
  it("adds the camera sentence only when direction is on", () => {
    expect(engineBrief("A mug", DEFAULT_SHOT, false)).toBe("A mug");
    expect(engineBrief("A mug", DEFAULT_SHOT, true)).toContain("A mug\n\n");
  });
  it("names the phase from progress", () => {
    expect(phaseOf(0, false)).toBe(0);
    expect(phaseOf(0.5, true)).toBe(1);
    expect(phaseOf(0.95, true)).toBe(2);
  });
});
