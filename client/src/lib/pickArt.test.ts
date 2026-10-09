import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PICK_ART, PICK_ART_IDS, pickArt, pickArtAlt } from "./pickArt";

const PUBLIC_ROOT = path.resolve(__dirname, "../../public");
const ART_DIR = path.join(PUBLIC_ROOT, "studio/o");
const MAX_BYTES = 140 * 1024;

describe("pickArt manifest", () => {
  it("maps an id to /studio/o/<id>.webp", () => {
    expect(pickArt("fast")).toBe("/studio/o/fast.webp");
    expect(pickArt("forge-1")).toBe("/studio/o/forge-1.webp");
  });

  it("every id maps to an existing file", () => {
    for (const id of PICK_ART_IDS) {
      const file = path.join(PUBLIC_ROOT, pickArt(id));
      expect(fs.existsSync(file), `${id} -> ${file}`).toBe(true);
    }
  });

  it("no file is over 140 KB", () => {
    for (const id of PICK_ART_IDS) {
      const size = fs.statSync(path.join(PUBLIC_ROOT, pickArt(id))).size;
      expect(size, `${id} is ${Math.round(size / 1024)} KB`).toBeLessThanOrEqual(MAX_BYTES);
    }
  });

  it("every file in studio/o is in the manifest, and all are webp", () => {
    const ids = new Set<string>(PICK_ART_IDS);
    for (const f of fs.readdirSync(ART_DIR)) {
      expect(f.endsWith(".webp"), f).toBe(true);
      expect(ids.has(f.replace(/\.webp$/, "")), `${f} is not in PICK_ART`).toBe(true);
    }
  });

  it("every id has a short description", () => {
    for (const id of PICK_ART_IDS) {
      expect(pickArtAlt(id).trim().length).toBeGreaterThan(0);
      expect(PICK_ART[id].length).toBeLessThanOrEqual(80);
    }
  });
});
