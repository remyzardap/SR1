import { describe, it, expect } from "vitest";
import * as React from "react";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { ListEmpty, ListFold, ListFolds, ListPage, NoResults, Row, Rows, SearchBar, StatStrip, forcedFolds, useListFolds } from "./ListView";
import { LIST_ROWS, LIST_STRIP } from "@/lab/fixtures/lists";

/**
 * The shared list pattern is presentational, so this is markup + stylesheet assertion.
 * The accordion itself (one open on a phone, remembered per layout) is covered by
 * components/fold/fold.test.ts, which these parts are built on.
 */

const css = fs.readFileSync(path.resolve(__dirname, "../../styles/redo/list.css"), "utf8");

function screen(props: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    React.createElement(
      "div",
      null,
      React.createElement(ListPage, {
        title: "Connections",
        lede: "What Sutaeru can reach.",
        fold: forcedFolds({ ...fakeFold, isOpen: (id: string) => id === "rows" }, ["rows", "more"]),
        ...props,
        children: [
          React.createElement(SearchBar, { key: "s", value: "nic", onChange: () => {}, label: "Search connections", count: "1 / 4" }),
          React.createElement(StatStrip, { key: "t", items: LIST_STRIP }),
          React.createElement(
            ListFolds,
            { key: "f", fold: fakeFold },
            React.createElement(
              ListFold,
              { id: "rows", label: "Linked services", pick: "2 of 4 active", fold: fakeFold },
              React.createElement(
                Rows,
                { label: "Connections" },
                LIST_ROWS.map((row, i) => React.createElement(Row, { key: i, ...row })),
              ),
            ),
            React.createElement(
              ListFold,
              { id: "more", label: "Empty", fold: fakeFold },
              React.createElement(ListEmpty, { title: "Nothing connected yet.", text: "Add one.", icon: "connections" }),
              React.createElement(NoResults, { query: "nic" }),
            ),
          ),
        ],
      }),
    )
  );
}

const fakeFold = {
  layout: "phone",
  ids: ["rows", "more"],
  open: ["rows"],
  isOpen: (id: string) => id === "rows",
  setOpen: () => {},
  toggle: () => {},
  foldAll: () => {},
  openAll: () => {},
  allFolded: false,
} as never;

describe("the list pattern", () => {
  const html = screen();

  it("folds each group and says what is behind it", () => {
    expect(html).toContain('data-fold="rows"');
    expect(html).toContain("2 of 4 active");
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-expanded="false"');
    // The open body is a region labelled by its own header.
    expect(html).toContain('role="region" aria-labelledby="fold-h');
  });

  it("gives every row the same shape", () => {
    expect((html.match(/class="lst-row[" ]/g) ?? []).length).toBe(LIST_ROWS.length);
    expect(html).toContain('class="lst-art round"');
    expect(html).toContain('class="lst-name"');
    expect(html).toContain('class="mono lst-meta"');
    expect(html).toContain('class="lst-side"');
    // The dimmed row is the revoked/paused one.
    expect(html).toContain('class="lst-row quiet"');
    // A row that goes somewhere carries the chevron.
    expect(html).toContain('class="lst-go"');
  });

  it("keeps the search line a real input with a name", () => {
    expect(html).toContain('type="search"');
    expect(html).toContain('aria-label="Search connections"');
    expect(html).toContain("Clear search");
  });

  it("puts the numbers in one strip, not four cards", () => {
    expect((html.match(/class="lst-strip"/g) ?? []).length).toBe(1);
    expect((html.match(/class="lst-stat"/g) ?? []).length).toBe(LIST_STRIP.length);
    expect(html).toContain('role="img"');
  });

  it("only marks up classes a stylesheet defines", () => {
    // Every .css under client/src, the same sweep the settings fixtures make.
    const defined = new Set<string>();
    const root = path.resolve(__dirname, "../..");
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".css")) {
          for (const m of fs.readFileSync(full, "utf8").matchAll(/\.([a-z_][\w-]*)/gi)) defined.add(m[1]);
        }
      }
    };
    walk(root);

    const used = new Set<string>();
    for (const match of html.matchAll(/class="([^"]+)"/g)) {
      for (const cls of match[1].split(/\s+/)) if (cls) used.add(cls);
    }
    const missing = [...used].filter((cls) => !defined.has(cls)).sort();
    expect(missing, `no stylesheet styles: ${missing.join(", ")}`).toEqual([]);
  });

  it("holds the 44px floor and stops the pulse under reduced motion", () => {
    expect(css).toMatch(/\.lst-search\s*\{[^}]*min-height:\s*48px/);
    expect(css).toMatch(/\.lst-row\s*\{[^}]*min-height:\s*62px/);
    expect(css).toMatch(/\.lst-side \.btn\s*\{\s*min-height:\s*44px/);
    expect(css).toMatch(/\.lst-input[^{]*\{\s*[^}]*min-height:\s*48px/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.lst-skeleton \{ animation: none; \} \}/);
    expect(css).toMatch(/\[data-reduce-motion="true"\] \.lst-skeleton \{ animation: none; \}/);
  });

  it("uses the page's own fold state, pinned only when asked", () => {
    const fold = forcedFolds(fakeFold as never);
    expect(fold.isOpen("rows")).toBe(true);
    const pinned = forcedFolds(fakeFold as never, ["more"]);
    expect(pinned.isOpen("more")).toBe(true);
    expect(pinned.isOpen("rows")).toBe(false);
    expect(typeof useListFolds).toBe("function");
  });
});
