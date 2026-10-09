import { describe, expect, it } from "vitest";
import { coverageFade, dotGrid, fieldValue, smooth, VARIANTS } from "./field";
import { routeDirection } from "./routeTransition";
import { containerTransformFrom, sharedAxis } from "./transitions";

const base = { x: 120, y: 80, t: 4, pointer: null, scroll: 0, tilt: { x: 0, y: 0 }, spec: VARIANTS.home };

describe("living field", () => {
  it("stays within 0..1 for any input", () => {
    for (let x = 0; x < 600; x += 37) {
      for (let y = 0; y < 900; y += 41) {
        const v = fieldValue({ ...base, x, y, scroll: 3, pointer: { x: 300, y: 300 } });
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("swells near the pointer and not far from it", () => {
    const near = fieldValue({ ...base, pointer: { x: base.x, y: base.y } });
    const far = fieldValue({ ...base, pointer: { x: base.x + 900, y: base.y + 900 } });
    const none = fieldValue(base);
    expect(near).toBeGreaterThanOrEqual(none);
    expect(far).toBeCloseTo(none, 5);
  });

  it("is deterministic and drifts with time", () => {
    expect(fieldValue(base)).toBe(fieldValue(base));
    expect(fieldValue({ ...base, t: 9 })).not.toBe(fieldValue(base));
  });

  it("fades out below the coverage line and is whole above it", () => {
    expect(coverageFade(0, 800, 0.5)).toBe(1);
    expect(coverageFade(400, 800, 0.5)).toBe(0);
    const mid = coverageFade(330, 800, 0.5);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(coverageFade(790, 800, 1)).toBe(1);
  });

  it("caps the dot count to the frame budget", () => {
    const g = dotGrid(2560, 1440, 12);
    expect(g.cols * g.rows).toBeLessThanOrEqual(2600);
    const small = dotGrid(390, 844, 24);
    expect(small.spacing).toBe(24);
  });

  it("smooths toward the target without overshooting", () => {
    let v = 0;
    for (let i = 0; i < 20; i++) v = smooth(v, 1, 0.016, 0.1);
    expect(v).toBeGreaterThan(0.5);
    expect(v).toBeLessThanOrEqual(1);
  });
});

describe("route direction", () => {
  it("goes forward when deeper, back when shallower, fades between siblings", () => {
    expect(routeDirection("/documents", "/documents/new")).toBe("forward");
    expect(routeDirection("/documents/new", "/documents")).toBe("back");
    expect(routeDirection("/chat", "/images")).toBe("fade");
  });
});

describe("transition helpers", () => {
  it("shared axis collapses to a plain fade under reduced motion", () => {
    const v = sharedAxis({ reduced: true }) as Record<string, any>;
    expect(v.enter.x).toBe(0);
    expect(v.center.transition.duration).toBe(0);
  });

  it("shared axis travels opposite ways in and out", () => {
    const v = sharedAxis({ distance: 30 }) as Record<string, any>;
    expect(v.enter.x).toBe(30);
    expect(v.exit.x).toBe(-30);
  });

  it("container transform maps the destination box onto the source", () => {
    const t = containerTransformFrom({ x: 0, y: 0, width: 100, height: 50 }, { x: 0, y: 0, width: 400, height: 200 });
    expect(t.scaleX).toBe(0.25);
    expect(t.scaleY).toBe(0.25);
    expect(t.x).toBe(-150);
    expect(t.y).toBe(-75);
  });
});
