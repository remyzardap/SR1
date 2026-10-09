import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FoldSection } from "./FoldSection";
import { FoldAllButton, FoldGroup } from "./FoldGroup";
import { PickTiles } from "./PickTiles";
import { Showcase } from "./Showcase";
import { GoBar } from "./GoBar";
import { PromptField } from "./PromptField";
import { foldKey, initialOpen, layoutFor, readFold, setSection, writeFold, type FoldState } from "./useFoldState";

class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  key(i: number) {
    return Array.from(this.m.keys())[i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
}

class BrokenStorage extends MemoryStorage {
  getItem(): string | null {
    throw new Error("SecurityError");
  }
  setItem(): void {
    throw new Error("QuotaExceededError");
  }
}

const IDS = ["shot", "angle", "lens", "light"];

describe("fold layout", () => {
  it("splits phone, tablet and desktop at 760 and 1100", () => {
    expect(layoutFor(390)).toBe("phone");
    expect(layoutFor(759)).toBe("phone");
    expect(layoutFor(760)).toBe("tablet");
    expect(layoutFor(1099)).toBe("tablet");
    expect(layoutFor(1100)).toBe("desktop");
  });
});

describe("fold defaults", () => {
  it("opens only the first section on phones", () => {
    expect(initialOpen(IDS, "phone", null)).toEqual(["shot"]);
  });
  it("opens the section that still needs input when given", () => {
    expect(initialOpen(IDS, "phone", null, { first: "lens" })).toEqual(["lens"]);
    expect(initialOpen(IDS, "phone", null, { first: "nope" })).toEqual(["shot"]);
  });
  it("opens every section at desktop width", () => {
    expect(initialOpen(IDS, "desktop", null)).toEqual(IDS);
  });
  it("lets tablets open several", () => {
    expect(initialOpen(IDS, "tablet", null, { first: "shot", tabletOpen: ["light", "zzz"] })).toEqual(["shot", "light"]);
  });
  it("returns nothing for a page without sections", () => {
    expect(initialOpen([], "phone", null)).toEqual([]);
  });
});

describe("phone accordion", () => {
  it("opening one section closes the others on phones", () => {
    let open = initialOpen(IDS, "phone", null);
    open = setSection(open, "lens", true, "phone");
    expect(open).toEqual(["lens"]);
    open = setSection(open, "light", true, "phone");
    expect(open).toEqual(["light"]);
    open = setSection(open, "light", false, "phone");
    expect(open).toEqual([]);
  });
  it("keeps several open on tablet and desktop", () => {
    let open = ["shot"];
    open = setSection(open, "lens", true, "tablet");
    open = setSection(open, "lens", true, "tablet");
    expect(open).toEqual(["shot", "lens"]);
    expect(setSection(open, "shot", false, "desktop")).toEqual(["lens"]);
  });
  it("never restores more than one open section on a phone", () => {
    expect(initialOpen(IDS, "phone", ["light", "lens"])).toEqual(["light"]);
  });
});

describe("fold persistence", () => {
  it("remembers the open sections per page and per layout", () => {
    const s = new MemoryStorage();
    writeFold("studio", "phone", ["lens"], s);
    writeFold("studio", "desktop", ["shot", "light"], s);
    writeFold("files", "phone", [], s);
    expect(readFold("studio", "phone", s)).toEqual(["lens"]);
    expect(readFold("studio", "desktop", s)).toEqual(["shot", "light"]);
    expect(readFold("studio", "tablet", s)).toBeNull();
    expect(readFold("files", "phone", s)).toEqual([]);
    expect(initialOpen(IDS, "phone", readFold("studio", "phone", s))).toEqual(["lens"]);
  });
  it("a remembered 'all folded' beats the desktop default", () => {
    const s = new MemoryStorage();
    writeFold("studio", "desktop", [], s);
    expect(initialOpen(IDS, "desktop", readFold("studio", "desktop", s))).toEqual([]);
  });
  it("drops ids that no longer exist", () => {
    expect(initialOpen(IDS, "tablet", ["gone", "lens"])).toEqual(["lens"]);
  });
  it("falls back to defaults on bad JSON, wrong shapes and broken storage", () => {
    const s = new MemoryStorage();
    s.setItem(foldKey("studio"), "{not json");
    expect(readFold("studio", "phone", s)).toBeNull();
    s.setItem(foldKey("studio"), JSON.stringify({ phone: "shot" }));
    expect(readFold("studio", "phone", s)).toBeNull();
    s.setItem(foldKey("studio"), JSON.stringify({ phone: [1, 2] }));
    expect(readFold("studio", "phone", s)).toBeNull();
    writeFold("studio", "phone", ["angle"], s); /* replaces the broken entry */
    expect(readFold("studio", "phone", s)).toEqual(["angle"]);

    const broken = new BrokenStorage();
    expect(readFold("studio", "phone", broken)).toBeNull();
    expect(() => writeFold("studio", "phone", ["shot"], broken)).not.toThrow();
    expect(readFold("studio", "phone", null)).toBeNull();
  });
});

function fakeState(open: string[], ids = IDS): FoldState {
  return {
    layout: "phone",
    ids,
    open,
    isOpen: (id) => open.includes(id),
    setOpen: () => {},
    toggle: () => {},
    foldAll: () => {},
    openAll: () => {},
    allFolded: open.length === 0,
  };
}

const h = React.createElement;

describe("FoldSection accessibility", () => {
  it("renders a real button with aria-expanded, aria-controls, the pick and the mini", () => {
    const html = renderToStaticMarkup(
      h(FoldGroup, { state: fakeState([]) }, h(FoldSection, { id: "shot", index: 1, label: "Shot", pick: "Medium", mini: "/studio/t/x.webp" }, h("p", null, "tiles"))),
    );
    expect(html).toMatch(/<h3 class="fold-h"><button type="button"[^>]*aria-expanded="false"/);
    expect(html).toContain('aria-controls="');
    expect(html).toContain(">01<");
    expect(html).toContain(">Shot<");
    expect(html).toContain('class="fold-pick">Medium<');
    expect(html).toContain('src="/studio/t/x.webp"');
    /* Folded: the body is not in the page. */
    expect(html).not.toContain("tiles");
  });

  it("open: aria-expanded true and a labelled region with the body", () => {
    const html = renderToStaticMarkup(
      h(FoldGroup, { state: fakeState(["shot"]) }, h(FoldSection, { id: "shot", label: "Shot", pick: "Medium" }, h("p", null, "tiles"))),
    );
    expect(html).toContain('aria-expanded="true"');
    const trig = html.match(/<button[^>]*id="([^"]+)"[^>]*aria-controls="([^"]+)"|<button[^>]*aria-controls="([^"]+)"[^>]*id="([^"]+)"/);
    expect(trig).not.toBeNull();
    expect(html).toMatch(/role="region"[^>]*aria-labelledby="fold-h/);
    expect(html).toContain("tiles");
  });

  it("controlled open wins over the group", () => {
    const html = renderToStaticMarkup(h(FoldGroup, { state: fakeState([]) }, h(FoldSection, { id: "a", label: "A", open: true }, "body")));
    expect(html).toContain('aria-expanded="true"');
  });

  it("works on its own, outside a group", () => {
    expect(renderToStaticMarkup(h(FoldSection, { id: "a", label: "A", defaultOpen: true }, "body"))).toContain("body");
    expect(renderToStaticMarkup(h(FoldSection, { id: "a", label: "A" }, "body"))).not.toContain("body");
  });
});

describe("Fold all pill", () => {
  it("shows only with three or more sections and flips its words", () => {
    expect(renderToStaticMarkup(h(FoldAllButton, { state: fakeState([], ["a", "b"]) }))).toBe("");
    expect(renderToStaticMarkup(h(FoldAllButton, { state: fakeState(["shot"]) }))).toContain("Fold all");
    expect(renderToStaticMarkup(h(FoldAllButton, { state: fakeState([]) }))).toContain("Open all");
  });
});

describe("PickTiles and Showcase", () => {
  const items = [
    { id: "a", label: "Alpha", sub: "first", art: "/a.webp" },
    { id: "b", label: "Beta", art: "/b.webp" },
    { id: "c", label: "Gamma", art: "/c.webp" },
  ];
  it("tiles are a radiogroup with one tab stop on the pick", () => {
    const html = renderToStaticMarkup(h(PickTiles, { items, value: "b", onChange: () => {}, label: "Shot" }));
    expect(html).toContain('role="radiogroup" aria-label="Shot"');
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-checked="true" tabindex="0" data-id="b"/);
    expect(html).toContain("<small>first</small>");
  });
  it("showcase: one radiogroup, a pager and one checked card", () => {
    const html = renderToStaticMarkup(h(Showcase, { items: items.map((i) => ({ id: i.id, name: i.label, art: i.art })), value: "a", onChange: () => {}, label: "Mode" }));
    expect(html).toContain('class="show"');
    expect(html).toContain('class="pager" aria-hidden="true"');
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
  });
  it("two options become a two-up pair", () => {
    const html = renderToStaticMarkup(h(Showcase, { items: items.slice(0, 2).map((i) => ({ id: i.id, name: i.label, art: i.art })), value: "a", onChange: () => {}, label: "Edit" }));
    expect(html).toContain('class="duo-sc"');
    expect(html).not.toContain("pager");
  });
});

describe("GoBar and PromptField", () => {
  it("go bar has one primary button and the summary", () => {
    const html = renderToStaticMarkup(h(GoBar, { summary: "Medium · Window", detail: "about 13 s", actionLabel: "Create", onAction: () => {} }));
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain("Medium · Window");
    expect(html).toContain("about 13 s");
  });
  it("prompt field has no label or hint, only the placeholder as its name", () => {
    const html = renderToStaticMarkup(h(PromptField, { value: "", onChange: () => {}, placeholder: "Describe your picture", maxRefs: 2, onAddRefs: () => {} }));
    expect(html).not.toContain("<label");
    expect(html).not.toMatch(/quote/i);
    expect(html).toContain('placeholder="Describe your picture"');
    expect(html).toContain('aria-label="Describe your picture"');
    expect(html).toContain('aria-label="Add a reference photo"');
  });
});
