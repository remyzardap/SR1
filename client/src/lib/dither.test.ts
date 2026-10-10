import { describe, expect, it } from "vitest";
import { seededRandom } from "./dither";

describe("seededRandom (mulberry32)", () => {
  it("gives the same field for the same seed", () => {
    // The Settings art sample redraws on every slider move; a shuffled field would flicker.
    const a = seededRandom(1);
    const b = seededRandom(1);
    expect(Array.from({ length: 6 }, () => a())).toEqual(Array.from({ length: 6 }, () => b()));
  });

  it("pins the first draws so the ramp never silently changes", () => {
    const r = seededRandom(1);
    const draws = Array.from({ length: 4 }, () => +r().toFixed(9));
    expect(draws).toEqual([0.627073941, 0.002735721, 0.52744704, 0.981050967]);
  });

  it("differs between seeds", () => {
    expect(seededRandom(7)()).not.toBe(seededRandom(2026)());
  });

  it("stays inside [0, 1) and spreads across it", () => {
    const r = seededRandom(42);
    const draws = Array.from({ length: 400 }, () => r());
    expect(draws.every((d) => d >= 0 && d < 1)).toBe(true);
    const mean = draws.reduce((s, d) => s + d, 0) / draws.length;
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(0.6);
  });

  it("treats any int32 as a seed, including 0 and negatives", () => {
    for (const seed of [0, -1, 0xffffffff]) {
      const value = seededRandom(seed)();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
