import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createChatEnergyStore, nextPhase, TOKEN_WINDOW_MS } from "./chatEnergy";
import { intensityScale, isLowEndDevice, livingMode } from "./gate";
import { mix, parseColor } from "./color";
import {
  approach,
  CHAT_PHASES,
  estimateTokens,
  RAMP_DOTS,
  rampDot,
  rampIsAnimated,
  rampMod,
  SETTLE_SECONDS,
  tokenRateToEnergy,
  type RampDrive,
} from "./ramp";
import { bezierAt, cssEasing, DURATION, EASING, tokenTransition } from "./tokens";

const drive = (over: Partial<RampDrive> = {}): RampDrive => ({ phase: "idle", t: 0, phaseAge: 0, energy: 0, level: 0, ...over });

describe("ramp math", () => {
  it("follows the Home recipe: 27 dots, faint ends, 13 px peak", () => {
    expect(RAMP_DOTS).toBe(27);
    const ends = [rampDot(0), rampDot(26)];
    for (const d of ends) {
      expect(d.size).toBeCloseTo(1.6, 5);
      expect(d.opacity).toBeCloseTo(0.1, 5);
    }
    const peak = rampDot(13);
    expect(peak.size).toBeCloseTo(13, 5);
    expect(peak.opacity).toBeCloseTo(0.88, 5);
  });

  it("is symmetric and rises monotonically to the centre", () => {
    for (let i = 0; i < 13; i++) {
      expect(rampDot(i).size).toBeCloseTo(rampDot(26 - i).size, 6);
      expect(rampDot(i + 1).size).toBeGreaterThan(rampDot(i).size);
    }
  });

  it("matches size = 1.6 + 11.4 sin^1.7 and opacity = .10 + .78 sin^1.1", () => {
    const s = Math.sin((Math.PI * 5) / 26);
    expect(rampDot(5).size).toBeCloseTo(1.6 + 11.4 * s ** 1.7, 8);
    expect(rampDot(5).opacity).toBeCloseTo(0.1 + 0.78 * s ** 1.1, 8);
  });

  it("idle only breathes a little", () => {
    for (let t = 0; t < 8; t += 0.37) {
      for (let i = 0; i < 27; i++) {
        const m = rampMod(i, 27, drive({ t }));
        expect(Math.abs(m.k - 1)).toBeLessThanOrEqual(0.06 + 1e-9);
        expect(m.o).toBe(1);
        expect(m.warm).toBe(0);
      }
    }
  });

  it("thinking sends a pulse across: the brightest dot moves left to right", () => {
    const brightest = (t: number) => {
      let best = 0;
      let bestK = -Infinity;
      for (let i = 0; i < 27; i++) {
        const k = rampMod(i, 27, drive({ phase: "thinking", t })).k;
        if (k > bestK) {
          bestK = k;
          best = i;
        }
      }
      return best;
    };
    expect(brightest(0.4)).toBeLessThan(brightest(0.8));
    expect(brightest(0.8)).toBeLessThan(brightest(1.2));
  });

  it("streaming swells with energy", () => {
    const avg = (energy: number) => {
      let sum = 0;
      for (let i = 0; i < 27; i++) sum += rampMod(i, 27, drive({ phase: "streaming", t: 1.3, energy })).k;
      return sum / 27;
    };
    expect(avg(0.9)).toBeGreaterThan(avg(0.1));
  });

  it("done settles once and then matches idle", () => {
    const early = rampMod(13, 27, drive({ phase: "done", phaseAge: 0.05, t: 2 }));
    expect(Math.abs(early.k - 1)).toBeGreaterThan(0.05);
    const late = rampMod(13, 27, drive({ phase: "done", phaseAge: SETTLE_SECONDS + 0.1, t: 2 }));
    expect(late).toEqual(rampMod(13, 27, drive({ phase: "idle", t: 2 })));
  });

  it("error is a still, quiet dim", () => {
    const a = rampMod(13, 27, drive({ phase: "error", t: 0 }));
    const b = rampMod(13, 27, drive({ phase: "error", t: 5 }));
    expect(a).toEqual(b);
    expect(a.o).toBeLessThan(0.5);
    expect(rampIsAnimated("error", false)).toBe(false);
  });

  it("never animates under reduced motion", () => {
    for (const p of CHAT_PHASES) expect(rampIsAnimated(p, true)).toBe(false);
    expect(rampIsAnimated("thinking", false)).toBe(true);
  });

  it("keeps every modulation within gentle bounds", () => {
    for (const phase of CHAT_PHASES) {
      for (let t = 0; t < 4; t += 0.21) {
        for (let i = 0; i < 27; i++) {
          const m = rampMod(i, 27, drive({ phase, t, phaseAge: t, energy: 1, level: 1 }));
          expect(m.k).toBeGreaterThan(0.4);
          expect(m.k).toBeLessThan(1.7);
          expect(m.warm).toBeGreaterThanOrEqual(0);
          expect(m.warm).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("energy mapping", () => {
  it("token rate saturates softly", () => {
    expect(tokenRateToEnergy(0)).toBe(0);
    expect(tokenRateToEnergy(-3)).toBe(0);
    expect(tokenRateToEnergy(Number.NaN)).toBe(0);
    expect(tokenRateToEnergy(20)).toBeGreaterThan(0.45);
    expect(tokenRateToEnergy(20)).toBeLessThan(0.55);
    expect(tokenRateToEnergy(60)).toBeGreaterThan(tokenRateToEnergy(20));
    expect(tokenRateToEnergy(1e6)).toBeLessThanOrEqual(1);
  });

  it("approach is frame-rate independent", () => {
    let a = 0;
    for (let i = 0; i < 6; i++) a = approach(a, 1, 1 / 60, 0.2);
    const b = approach(0, 1, 6 / 60, 0.2);
    expect(a).toBeCloseTo(b, 6);
    expect(approach(0.3, 1, 0.1, 0)).toBe(1);
  });

  it("estimates about four characters a token", () => {
    expect(estimateTokens(40)).toBe(10);
    expect(estimateTokens(0)).toBe(0);
  });

  it("store measures the token rate over its window and moves thinking to streaming", () => {
    const s = createChatEnergyStore();
    s.setPhase("thinking", 0);
    s.tokens(10, 100);
    expect(s.getSnapshot().phase).toBe("streaming");
    s.tokens(20, 600);
    expect(s.rate(700)).toBeCloseTo(30 / (TOKEN_WINDOW_MS / 1000), 6);
    expect(s.rate(100 + TOKEN_WINDOW_MS + 1)).toBeCloseTo(20 / (TOKEN_WINDOW_MS / 1000), 6);
    expect(s.energy(10_000)).toBe(0);
  });

  it("store notifies subscribers on phase changes only", () => {
    const s = createChatEnergyStore();
    let n = 0;
    s.subscribe(() => n++);
    s.setPhase("thinking");
    s.setPhase("thinking");
    expect(n).toBe(1);
    s.setPhase("error");
    expect(n).toBe(2);
  });

  it("feed transitions: start thinks, stop settles, error dims, retry clears", () => {
    expect(nextPhase(null, { streaming: true }, "idle")).toBe("thinking");
    expect(nextPhase({ streaming: true }, { streaming: true, text: "abc" }, "streaming")).toBeNull();
    expect(nextPhase({ streaming: true }, { streaming: false }, "streaming")).toBe("done");
    expect(nextPhase({ streaming: true }, { streaming: false, error: true }, "streaming")).toBe("error");
    expect(nextPhase({ streaming: false, error: true }, { streaming: false, error: false }, "error")).toBe("idle");
    expect(nextPhase({ streaming: false }, { streaming: false, listening: true }, "idle")).toBe("listening");
    expect(nextPhase({ streaming: false, listening: true }, { streaming: false }, "listening")).toBe("idle");
    // A feeder that never saw the error does not clear it.
    expect(nextPhase({ streaming: false }, { streaming: false }, "error")).toBeNull();
  });
});

describe("reduced-motion and device gating", () => {
  const base = { backgroundArt: true, intensity: 70, reducedMotion: false, lowEnd: false };
  it("runs live by default", () => expect(livingMode(base)).toBe("live"));
  it("goes still under reduced motion", () => expect(livingMode({ ...base, reducedMotion: true })).toBe("static"));
  it("is off when Background art is off", () => expect(livingMode({ ...base, backgroundArt: false })).toBe("off"));
  it("is off on low-end devices", () => expect(livingMode({ ...base, lowEnd: true })).toBe("off"));
  it("is off at zero intensity", () => expect(livingMode({ ...base, intensity: 0 })).toBe("off"));
  it("spots low-end devices", () => {
    expect(isLowEndDevice({ cores: 2 })).toBe(true);
    expect(isLowEndDevice({ memory: 2 })).toBe(true);
    expect(isLowEndDevice({ saveData: true })).toBe(true);
    expect(isLowEndDevice({ cores: 8, memory: 8 })).toBe(false);
    expect(isLowEndDevice({})).toBe(false);
  });
  it("scales intensity with 70 as the untouched value", () => {
    expect(intensityScale(70)).toBe(1);
    expect(intensityScale(35)).toBe(0.5);
    expect(intensityScale(500)).toBeCloseTo(100 / 70);
  });
});

describe("motion tokens", () => {
  it("emphasized easings are the M3 values", () => {
    expect(EASING.emphasizedDecelerate).toEqual([0.05, 0.7, 0.1, 1]);
    expect(EASING.emphasizedAccelerate).toEqual([0.3, 0, 0.8, 0.15]);
    expect(cssEasing("emphasized")).toBe("cubic-bezier(0.2, 0, 0, 1)");
  });

  it("bezierAt hits the ends and is monotonic", () => {
    let prev = 0;
    for (let x = 0; x <= 1.0001; x += 0.05) {
      const y = bezierAt(EASING.emphasizedDecelerate, x);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = y;
    }
    expect(bezierAt(EASING.emphasized, 0)).toBe(0);
    expect(bezierAt(EASING.emphasized, 1)).toBe(1);
    expect(bezierAt([0, 0, 1, 1], 0.3)).toBeCloseTo(0.3, 3);
  });

  it("transitions collapse under reduced motion", () => {
    expect(tokenTransition("medium2", "emphasized", true).duration).toBe(0);
    expect(tokenTransition("medium2").duration).toBeCloseTo(0.3);
  });

  it("CSS variables in motion.css match the TypeScript tokens", () => {
    const css = readFileSync(path.join(__dirname, "../../styles/redo/motion.css"), "utf8");
    const varFor = (name: string) => new RegExp(`--m-ease-${name}:\\s*cubic-bezier\\(([^)]+)\\)`).exec(css)?.[1];
    expect(varFor("emphasized")?.replace(/\s/g, "")).toBe(EASING.emphasized.join(","));
    expect(varFor("emphasized-decelerate")?.replace(/\s/g, "")).toBe(EASING.emphasizedDecelerate.join(","));
    expect(varFor("emphasized-accelerate")?.replace(/\s/g, "")).toBe(EASING.emphasizedAccelerate.join(","));
    for (const [key, ms] of Object.entries(DURATION)) {
      const kebab = key.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/(\d)/, "$1");
      expect(css, `--m-dur-${kebab}`).toMatch(new RegExp(`--m-dur-${kebab}:\\s*${ms}ms`));
    }
  });
});

describe("colour helpers", () => {
  it("parses hex and rgb", () => {
    expect(parseColor("#F4511E")).toEqual([244, 81, 30]);
    expect(parseColor("#fff")).toEqual([255, 255, 255]);
    expect(parseColor("rgb(10, 20, 30)")).toEqual([10, 20, 30]);
    expect(parseColor("rgba(10 20 30 / .5)")).toEqual([10, 20, 30]);
  });
  it("mixes", () => {
    expect(mix([0, 0, 0], [100, 200, 50], 0.5)).toEqual([50, 100, 25]);
    expect(mix([0, 0, 0], [100, 200, 50], 3)).toEqual([100, 200, 50]);
  });
});
