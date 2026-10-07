import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  PHOTO_MANIFEST,
  photoUrl,
  credits,
  getPhoto,
  ALL_PHOTO_IDS,
  photoIdsByGroup,
} from "./studioPhotos";

const STUDIO_ROOT = path.resolve(__dirname, "../../public/studio");

describe("studioPhotos manifest", () => {
  it("has at least one entry per expected group", () => {
    const groups = new Set(PHOTO_MANIFEST.map((p) => p.group));
    expect(groups.has("light")).toBe(true);
    expect(groups.has("angle")).toBe(true);
    expect(groups.has("variant")).toBe(true);
    expect(groups.has("style")).toBe(true);
    expect(groups.has("engine")).toBe(true);
    expect(groups.has("reference")).toBe(true);
    expect(groups.has("cover")).toBe(true);
  });

  it("every entry has a non-empty photographer", () => {
    for (const entry of PHOTO_MANIFEST) {
      expect(entry.photographer).toBeTruthy();
      expect(entry.photographer.trim().length).toBeGreaterThan(0);
    }
  });

  it("every entry has a valid source URL", () => {
    for (const entry of PHOTO_MANIFEST) {
      expect(entry.sourceUrl).toMatch(/^https:\/\/unsplash\.com\/photos\//);
    }
  });

  it("every entry has the correct licence", () => {
    for (const entry of PHOTO_MANIFEST) {
      expect(entry.licence).toBe("Unsplash License");
    }
  });

  it("every entry has a focal point with two numbers", () => {
    for (const entry of PHOTO_MANIFEST) {
      expect(Array.isArray(entry.focalPoint)).toBe(true);
      expect(entry.focalPoint.length).toBe(2);
      expect(typeof entry.focalPoint[0]).toBe("number");
      expect(typeof entry.focalPoint[1]).toBe("number");
      expect(entry.focalPoint[0]).toBeGreaterThanOrEqual(0);
      expect(entry.focalPoint[0]).toBeLessThanOrEqual(100);
      expect(entry.focalPoint[1]).toBeGreaterThanOrEqual(0);
      expect(entry.focalPoint[1]).toBeLessThanOrEqual(100);
    }
  });

  it("rimPoint, when present, has two numbers in range", () => {
    for (const entry of PHOTO_MANIFEST) {
      if (entry.rimPoint) {
        expect(Array.isArray(entry.rimPoint)).toBe(true);
        expect(entry.rimPoint.length).toBe(2);
        expect(typeof entry.rimPoint[0]).toBe("number");
        expect(typeof entry.rimPoint[1]).toBe("number");
        expect(entry.rimPoint[0]).toBeGreaterThanOrEqual(0);
        expect(entry.rimPoint[0]).toBeLessThanOrEqual(100);
        expect(entry.rimPoint[1]).toBeGreaterThanOrEqual(0);
        expect(entry.rimPoint[1]).toBeLessThanOrEqual(100);
      }
    }
  });

  it("every entry's file exists on disk for each declared size", () => {
    for (const entry of PHOTO_MANIFEST) {
      const fileRecord = entry.file as Record<string, string>;
      const sizes = Object.keys(fileRecord) as Array<"t" | "m" | "l">;
      for (const size of sizes) {
        const fileName = fileRecord[size];
        const dir = entry.group === "cover" ? "c" : size;
        const fullPath = path.join(STUDIO_ROOT, dir, `${fileName}.webp`);
        expect(fs.existsSync(fullPath)).toBe(true);
      }
    }
  });

  it("tileOnly entries only declare the 't' size", () => {
    for (const entry of PHOTO_MANIFEST) {
      if (entry.tileOnly) {
        const fileRecord = entry.file as Record<string, string>;
        expect(Object.keys(fileRecord)).toEqual(["t"]);
        const fullPath = path.join(STUDIO_ROOT, "t", `${fileRecord.t}.webp`);
        expect(fs.existsSync(fullPath)).toBe(true);
      }
    }
  });

  it("photoUrl returns correct path for light/angle/variant/style photos", () => {
    expect(photoUrl("light-window", "t")).toBe("/studio/t/light-window.webp");
    expect(photoUrl("light-window", "m")).toBe("/studio/m/light-window.webp");
    expect(photoUrl("light-window", "l")).toBe("/studio/l/light-window.webp");
    expect(photoUrl("angle-top", "t")).toBe("/studio/t/angle-top.webp");
    expect(photoUrl("var-window-2", "m")).toBe("/studio/m/var-window-2.webp");
    expect(photoUrl("look-painted", "l")).toBe("/studio/l/look-painted.webp");
  });

  it("photoUrl returns correct path for cover photos (uses c/ directory)", () => {
    expect(photoUrl("cov-solar", "t")).toBe("/studio/c/cov-solar.webp");
    expect(photoUrl("cov-solar", "m")).toBe("/studio/c/cov-solar.webp");
    expect(photoUrl("cov-solar", "l")).toBe("/studio/c/cov-solar.webp");
  });

  it("photoUrl returns correct path for tileOnly photos (falls back to t)", () => {
    expect(photoUrl("eng-gemini", "t")).toBe("/studio/t/eng-gemini.webp");
    expect(photoUrl("eng-gemini", "m")).toBe("/studio/t/eng-gemini.webp");
    expect(photoUrl("eng-gemini", "l")).toBe("/studio/t/eng-gemini.webp");
    expect(photoUrl("ref", "l")).toBe("/studio/t/ref.webp");
  });

  it("photoUrl throws for unknown id", () => {
    expect(() => photoUrl("unknown", "t")).toThrow("Photo not found: unknown");
  });

  it("credits returns deduplicated photographer list", () => {
    const creds = credits();
    expect(creds.length).toBeGreaterThan(0);
    const unique = new Set(creds);
    expect(creds.length).toBe(unique.size);
    expect(creds).toContain("Thomas Park");
    expect(creds).toContain("Barney Goodman");
    expect(creds).toContain("Europeana");
  });

  it("getPhoto returns entry for valid id", () => {
    const entry = getPhoto("light-window");
    expect(entry).toBeDefined();
    expect(entry?.id).toBe("light-window");
    expect(entry?.photographer).toBe("Thomas Park");
  });

  it("getPhoto returns undefined for unknown id", () => {
    expect(getPhoto("unknown")).toBeUndefined();
  });

  it("ALL_PHOTO_IDS contains every manifest id exactly once", () => {
    expect(ALL_PHOTO_IDS.length).toBe(PHOTO_MANIFEST.length);
    const unique = new Set(ALL_PHOTO_IDS);
    expect(ALL_PHOTO_IDS.length).toBe(unique.size);
  });

  it("photoIdsByGroup returns correct ids for each group", () => {
    expect(photoIdsByGroup("light").sort()).toEqual([
      "light-backlit",
      "light-golden",
      "light-night",
      "light-studio",
      "light-window",
    ].sort());
    expect(photoIdsByGroup("angle").sort()).toEqual(["angle-high", "angle-low", "angle-top"].sort());
    expect(photoIdsByGroup("engine").sort()).toEqual(["eng-gemini", "eng-openai", "eng-wan"].sort());
    expect(photoIdsByGroup("reference")).toEqual(["ref"]);
    expect(photoIdsByGroup("cover").length).toBe(8);
  });
});