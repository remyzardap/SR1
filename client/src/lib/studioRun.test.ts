import { describe, expect, it } from "vitest";

import { DEFAULT_SHOT } from "./studio";
import { ENGINE_STYLE, PREP_MS, PREVIEW_CLARITY, RESOLVE_HOLD_MS, RESOLVE_MS, RUN_HOLD, approach, clarityOf, resolveClarity, engineBrief, estimate, labelFromPrompt, phaseOf, runProgress, runStatus, suggestEngine } from "./studioRun";

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

describe("runProgress", () => {
  it("waits during preparation, then always moves forward and never reaches the end", () => {
    expect(runProgress(0, 13000)).toBe(0);
    expect(runProgress(PREP_MS, 13000)).toBe(0);
    let last = 0;
    for (let t = PREP_MS + 100; t < 400_000; t += 250) {
      const p = runProgress(t, 13000);
      expect(p).toBeGreaterThan(last - 1e-12);
      expect(p).toBeLessThanOrEqual(RUN_HOLD);
      if (t < 30000) expect(p).toBeLessThan(RUN_HOLD - 0.001);
      last = p;
    }
  });
  it("is about 86% when the usual time is up", () => {
    expect(runProgress(PREP_MS + 13000, 13000)).toBeCloseTo(0.86, 2);
  });
  it("has no jumps: 100 ms never moves it more than 2%", () => {
    for (let t = PREP_MS; t < 30000; t += 100) {
      expect(runProgress(t + 100, 9000) - runProgress(t, 9000)).toBeLessThan(0.02);
    }
  });
});

describe("runStatus", () => {
  const base = { expectedMs: 13000, engine: "gemini" as const };
  it("names each stage", () => {
    expect(runStatus({ ...base, elapsedMs: 200 }).stage).toBe("preparing");
    expect(runStatus({ ...base, elapsedMs: 3000 }).stage).toBe("drawing");
    expect(runStatus({ ...base, elapsedMs: 11000 }).stage).toBe("refining");
    expect(runStatus({ ...base, elapsedMs: 11000, saving: true }).stage).toBe("saving");
  });
  it("counts the time left down and stays honest after the usual time", () => {
    expect(runStatus({ ...base, elapsedMs: PREP_MS + 4000 }).timeText).toBe("About 9 s left");
    expect(runStatus({ ...base, elapsedMs: PREP_MS + 11000 }).timeText).toBe("A few seconds left");
    const late = runStatus({ ...base, elapsedMs: PREP_MS + 14000 });
    expect(late.timeText).toBe("Almost there");
    expect(late.slow).toBe(false);
    const slow = runStatus({ ...base, elapsedMs: PREP_MS + 20000 });
    expect(slow.slow).toBe(true);
    expect(slow.timeText).toBe("Taking longer than usual");
    expect(slow.etaSeconds).toBeNull();
  });
  it("shows minutes for long runs and says the GPU is waking", () => {
    const gpu = runStatus({ elapsedMs: 5000, expectedMs: 90000, engine: "forge" });
    expect(gpu.stage).toBe("warming");
    expect(gpu.timeText).toBe("About 2 min left");
    expect(runStatus({ elapsedMs: 300000, expectedMs: 90000, engine: "forge" }).stage).toBe("warming");
  });
  it("lets real signals push progress forward, never back", () => {
    const est = runStatus({ ...base, elapsedMs: 2000 }).progress;
    const two = runStatus({ ...base, elapsedMs: 2000, made: 2, count: 4 });
    expect(two.progress).toBeGreaterThan(est);
    expect(two.word).toBe("2 of 4 ready");
    expect(runStatus({ ...base, elapsedMs: 2000, saving: true }).progress).toBe(RUN_HOLD);
  });
  it("never shows a vendor name", () => {
    for (const engine of ["gemini", "openai", "qwen", "forge"] as const) {
      for (const elapsedMs of [0, 2000, 12000, 60000, 400000]) {
        const s = runStatus({ elapsedMs, expectedMs: 13000, engine });
        expect(`${s.word} ${s.timeText}`).not.toMatch(/gemini|openai|wan|flux|qwen/i);
      }
    }
  });
});

describe("reveal curve", () => {
  it("stops short of sharp while drawing", () => {
    expect(clarityOf(0)).toBe(0);
    expect(clarityOf(RUN_HOLD)).toBeCloseTo(PREVIEW_CLARITY, 5);
    expect(clarityOf(5)).toBeCloseTo(PREVIEW_CLARITY, 5);
    expect(clarityOf(-1)).toBe(0);
  });
  it("approaches a target without depending on frame rate", () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = approach(a, 1, 1 / 60);
    let b = 0;
    for (let i = 0; i < 30; i++) b = approach(b, 1, 1 / 30);
    expect(a).toBeCloseTo(b, 6);
    expect(a).toBeLessThan(1);
    expect(approach(0.5, 0.5, 0.1)).toBe(0.5);
  });
  it("holds, then eases out to exactly 1", () => {
    expect(resolveClarity(0.7, 0)).toBe(0.7);
    expect(resolveClarity(0.7, RESOLVE_HOLD_MS)).toBe(0.7);
    expect(resolveClarity(0.7, RESOLVE_HOLD_MS + RESOLVE_MS)).toBe(1);
    let last = 0.7;
    for (let t = 0; t < 2000; t += 50) {
      const c = resolveClarity(0.7, t);
      expect(c).toBeGreaterThanOrEqual(last);
      last = c;
    }
  });
  it("names engines without vendors", () => {
    for (const s of Object.values(ENGINE_STYLE)) expect(s).not.toMatch(/gemini|openai|wan|flux|qwen/i);
  });
});
