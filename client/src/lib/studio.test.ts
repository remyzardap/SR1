import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHOT,
  GROUP_TITLES,
  OPTIONS,
  PHOTOS,
  PHOTO_CREDITS,
  SHAPES,
  compose,
  direction,
  optionOf,
  photoSrc,
  photoTile,
  shapeOf,
  type AspectRatio,
  type PhotoName,
  type Shot,
} from "./studio";

const ids = <T extends string>(list: { id: T }[]) => list.map((o) => o.id);

describe("studio option tables", () => {
  it("covers every camera group the titles name, and nothing else", () => {
    expect(Object.keys(GROUP_TITLES).sort()).toEqual(["angle", "lens", "light", "look", "ratio", "shot"]);
    for (const group of ["shot", "angle", "lens", "light", "look"] as const) {
      expect(OPTIONS[group].length).toBeGreaterThan(0);
      expect(new Set(ids(OPTIONS[group])).size).toBe(OPTIONS[group].length);
    }
  });

  it("gives every option words for the prompt and a label for the tile", () => {
    for (const group of Object.values(OPTIONS)) {
      for (const option of group) {
        expect(option.label.length).toBeGreaterThan(0);
        expect(option.words.length).toBeGreaterThan(0);
      }
    }
  });

  it("starts on a shot the tables actually offer", () => {
    for (const group of ["shot", "angle", "lens", "light", "look"] as const) {
      expect(ids(OPTIONS[group])).toContain(DEFAULT_SHOT[group]);
    }
    expect(ids(SHAPES)).toContain(DEFAULT_SHOT.ratio);
  });

  it("lists the shapes in the order the picker shows them, with a real ratio", () => {
    expect(ids(SHAPES)).toEqual(["1:1", "4:3", "16:9", "3:4", "9:16", "4:5"]);
    expect(shapeOf("4:3").r).toBeCloseTo(4 / 3, 6);
    expect(shapeOf("9:16").r).toBeCloseTo(9 / 16, 6);
  });

  it("falls back to the first option when an id is unknown", () => {
    // A run restored from storage can name a choice that has since been dropped.
    expect(optionOf("shot", "nope" as never).id).toBe("detail");
    expect(shapeOf("nope" as never).id).toBe("1:1");
  });

  it("credits each sample photograph once", () => {
    expect(new Set(PHOTO_CREDITS).size).toBe(PHOTO_CREDITS.length);
    expect(PHOTO_CREDITS.length).toBeGreaterThan(0);
    for (const photo of Object.values(PHOTOS)) {
      expect(PHOTO_CREDITS).toContain(photo.by);
      expect(photo.id).toMatch(/^[\w-]+$/);
      expect(photo.f).toHaveLength(2);
    }
  });
});

describe("direction", () => {
  it("sends the engine one capitalised sentence plus the look", () => {
    const text = direction(DEFAULT_SHOT);
    expect(text[0]).toBe(text[0].toUpperCase());
    expect(text.startsWith("Medium shot,")).toBe(true);
    expect(text).toContain("at eye level, straight on");
    expect(text).toContain("soft morning window light from the left");
    expect(text.endsWith(optionOf("look", "photo").words)).toBe(true);
  });

  it("adds the lens only when the look is a photograph", () => {
    expect(direction({ ...DEFAULT_SHOT, look: "photo" })).toContain("50mm lens");
    expect(direction({ ...DEFAULT_SHOT, look: "film" })).toContain("50mm lens");
    expect(direction({ ...DEFAULT_SHOT, look: "clay" })).not.toContain("50mm lens");
    expect(direction({ ...DEFAULT_SHOT, look: "painted" })).not.toContain("50mm lens");
  });

  it("carries the 85mm softness words when the lens changes", () => {
    expect(direction({ ...DEFAULT_SHOT, lens: "85" })).toContain("85mm lens with a soft, blurred background");
  });
});

describe("compose", () => {
  const shot = (over: Partial<Shot>): Shot => ({ ...DEFAULT_SHOT, ...over });

  it("picks a light photograph for a straight-on angle and does not grade it", () => {
    const c = compose(shot({ angle: "eye", light: "golden" }));
    expect(c.photo).toBe("light-golden");
    expect(c.grade).toBeNull();
    expect(c.focus).toEqual(PHOTOS["light-golden"].f);
  });

  it("switches to an angle photograph and grades that toward the chosen light", () => {
    const c = compose(shot({ angle: "high", light: "night" }));
    expect(c.photo).toBe("angle-high");
    expect(c.grade).toBe("night");
  });

  it("frames the rim when Detail is picked and the photograph has one", () => {
    const c = compose(shot({ shot: "detail" }));
    expect(c.focus).toEqual(PHOTOS["light-window"].rim);
  });

  it("uses the style reference for painted and clay, without grade or blur", () => {
    for (const look of ["painted", "clay"] as const) {
      const c = compose(shot({ look, lens: "100", angle: "high" }));
      expect(c.photo).toBe(`look-${look}` as PhotoName);
      expect(c.look).toBe(look);
      expect(c.grade).toBeNull();
      expect(c.blur).toBe(0);
      expect(c.focus).toEqual(PHOTOS[`look-${look}` as PhotoName].f);
    }
  });

  it("settles Detail on Close for a style reference, which has no rim to frame", () => {
    expect(compose(shot({ look: "clay", shot: "detail" })).zoom).toBeCloseTo(1.5, 6);
    expect(compose(shot({ look: "clay", shot: "close" })).zoom).toBeCloseTo(1.5, 6);
  });

  it("tilts and pushes in for a dutch angle", () => {
    const flat = compose(shot({ angle: "eye" }));
    const dutch = compose(shot({ angle: "dutch" }));
    expect(dutch.rotate).toBe(-8);
    expect(flat.rotate).toBe(0);
    expect(dutch.zoom).toBeCloseTo(flat.zoom * 1.22, 6);
  });

  it("never zooms past 3.4, however tight the choice", () => {
    const c = compose(shot({ shot: "detail", lens: "100", angle: "dutch" }));
    expect(c.zoom).toBe(3.4);
  });

  it("blurs by the lens and nothing else", () => {
    const byLens: Record<string, number> = { "24": 0, "35": 0, "50": 0.6, "85": 3.2, "100": 6.5 };
    for (const lens of ids(OPTIONS.lens)) {
      expect(compose(shot({ lens })).blur).toBe(byLens[lens]);
    }
  });

  it("holds for every choice the pickers can make", () => {
    // The preview must never land on a photograph that does not exist or a zoom the CSS cannot
    // apply, for any combination of the tiles kept on screen.
    const all = Object.values(PHOTOS) as (typeof PHOTOS)[PhotoName][];
    for (const s of OPTIONS.shot) {
      for (const a of OPTIONS.angle) {
        for (const l of OPTIONS.lens) {
          for (const li of OPTIONS.light) {
            for (const lo of OPTIONS.look) {
              const c = compose({ shot: s.id, angle: a.id, lens: l.id, light: li.id, look: lo.id, ratio: "4:3" });
              expect(all).toContain(PHOTOS[c.photo]);
              expect(c.zoom).toBeGreaterThan(0);
              expect(c.zoom).toBeLessThanOrEqual(3.4);
              expect(c.rotate).toBe(a.id === "dutch" ? -8 : 0);
              expect(c.focus[0]).toBeGreaterThanOrEqual(0);
              expect(c.focus[1]).toBeLessThanOrEqual(100);
              if (lo.id === "painted" || lo.id === "clay") {
                expect(c.grade).toBeNull();
                expect(c.blur).toBe(0);
              }
            }
          }
        }
      }
    }
  });
});

describe("photoSrc", () => {
  const name = "light-window" as PhotoName;

  it("asks for the smallest stored size that stays sharp", () => {
    expect(photoSrc(name, 300, 1)).toBe("/studio/t/light-window.webp");
    expect(photoSrc(name, 480, 1)).toBe("/studio/m/light-window.webp");
    expect(photoSrc(name, 600, 1)).toBe("/studio/l/light-window.webp");
  });

  it("demands more pixels for a frame narrower than the photograph", () => {
    // A 3:4 crop of a 3:2 photo uses fewer of its pixels, so 500 CSS px needs the large file.
    expect(photoSrc(name, 500, 0.75)).toBe("/studio/l/light-window.webp");
    expect(photoSrc(name, 500, 1.5)).toBe("/studio/m/light-window.webp");
  });

  it("steps at the documented thresholds", () => {
    expect(photoSrc(name, 480, 1.5)).toBe("/studio/t/light-window.webp");
    expect(photoSrc(name, 820, 1.5)).toBe("/studio/m/light-window.webp");
    expect(photoSrc(name, 821, 1.5)).toBe("/studio/l/light-window.webp");
  });

  it("keeps the small tile fixed for the picker grid", () => {
    expect(photoTile(name)).toBe("/studio/t/light-window.webp");
    for (const key of Object.keys(PHOTOS) as PhotoName[]) {
      expect(photoTile(key)).toMatch(/^\/studio\/t\/[\w-]+\.webp$/);
    }
  });

  it("only ever names shapes the studio offers", () => {
    for (const shape of ids(SHAPES) as AspectRatio[]) {
      expect(shapeOf(shape).id).toBe(shape);
    }
  });
});
