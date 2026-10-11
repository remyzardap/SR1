import { describe, expect, it } from "vitest";

import { PICK_ART_IDS, pickArt } from "@/lib/pickArt";
import { paperIconFor, pickIdOf } from "@/lib/paperTile";

describe("paper tiles for picker pictures", () => {
  it("gives every picker picture a line icon, except the sample photos", () => {
    for (const id of PICK_ART_IDS) {
      const icon = paperIconFor(pickArt(id));
      if (id.startsWith("forge-")) expect(icon, id).toBeNull();
      else expect(icon, id).toBeTruthy();
    }
  });

  it("leaves other images (avatars, covers, uploads) as photos", () => {
    expect(paperIconFor("/studio/c/cov-solar.webp")).toBeNull();
    expect(paperIconFor("https://example.com/me.jpg")).toBeNull();
    expect(pickIdOf("/studio/o/depth-deep.webp")).toBe("depth-deep");
    expect(pickIdOf("/studio/o/depth-deep.png")).toBeNull();
  });
});
