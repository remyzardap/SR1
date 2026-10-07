import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { applyThemeChoice, currentMode, readThemeChoice, setThemeChoice, THEME_STORAGE_KEY } from "./theme";

const ROOT_DIR = resolve(import.meta.dirname, "../../..");
const INDEX_HTML = readFileSync(resolve(ROOT_DIR, "client/index.html"), "utf8");
const MAIN_TSX = readFileSync(resolve(ROOT_DIR, "client/src/main.tsx"), "utf8");
const RESKIN_TOKENS_CSS = readFileSync(resolve(ROOT_DIR, "client/src/styles/reskin-tokens.css"), "utf8");
const PROTOTYPE_APP_CSS = readFileSync(resolve(ROOT_DIR, "design/sutaeru-app/app.css"), "utf8");

describe("Milestone 1: Fonts contract", () => {
  it("removes external Google Fonts CDN links from index.html", () => {
    expect(INDEX_HTML).not.toContain("fonts.googleapis.com");
    expect(INDEX_HTML).not.toContain("fonts.gstatic.com");
  });

  it("preloads the two display weights in index.html", () => {
    expect(INDEX_HTML).toMatch(/<link\s+rel="preload"\s+href="[^"]*inter-tight-latin-700-normal\.woff2"\s+as="font"\s+type="font\/woff2"\s+crossorigin\s*\/?>/);
    expect(INDEX_HTML).toMatch(/<link\s+rel="preload"\s+href="[^"]*inter-tight-latin-800-normal\.woff2"\s+as="font"\s+type="font\/woff2"\s+crossorigin\s*\/?>/);
  });

  it("display font files exist in client/public/fonts", () => {
    expect(existsSync(resolve(ROOT_DIR, "client/public/fonts/inter-tight-latin-700-normal.woff2"))).toBe(true);
    expect(existsSync(resolve(ROOT_DIR, "client/public/fonts/inter-tight-latin-800-normal.woff2"))).toBe(true);
  });

  it("imports only the latin subset weights actually used by app.css in main.tsx", () => {
    expect(MAIN_TSX).toContain('@fontsource/inter-tight/latin-700.css');
    expect(MAIN_TSX).toContain('@fontsource/inter-tight/latin-800.css');
    expect(MAIN_TSX).toContain('@fontsource/inter/latin-400.css');
    expect(MAIN_TSX).toContain('@fontsource/inter/latin-500.css');
    expect(MAIN_TSX).toContain('@fontsource/inter/latin-600.css');
    expect(MAIN_TSX).toContain('@fontsource/jetbrains-mono/latin-500.css');
  });
});

describe("Milestone 1: Tokens contract", () => {
  const REQUIRED_TOKENS = [
    "--paper",
    "--panel",
    "--card",
    "--stroke",
    "--ink",
    "--quiet",
    "--rule",
    "--seg-off",
    "--accent",
    "--accent-tint",
    "--alert",
    "--alert-tint",
    "--hair",
    "--hero",
    "--hero-ink",
    "--hero-quiet",
    "--hero-hair",
    "--scrim",
    "--shadow",
    "--lift",
    "--disp",
    "--body",
    "--mono",
    "--r-card",
    "--r-lg",
    "--r-thumb",
    "--gutter",
    "--ease",
    "--t",
    "--top-h",
  ];

  it("reskin-tokens.css defines all required tokens in :root", () => {
    for (const token of REQUIRED_TOKENS) {
      expect(RESKIN_TOKENS_CSS, `Token ${token} should be declared in reskin-tokens.css`).toContain(`${token}:`);
    }
  });

  it("light theme values match prototype app.css exactly", () => {
    const lightTokens = [
      ["--paper", "#F7F6F2"],
      ["--panel", "#EFEDE7"],
      ["--card", "#FFFFFF"],
      ["--stroke", "#E3E1DB"],
      ["--ink", "#242320"],
      ["--quiet", "#66645F"],
      ["--rule", "#B6BBC3"],
      ["--seg-off", "#DAD7CF"],
      ["--accent", "#F4511E"],
      ["--accent-tint", "#FCE9DE"],
      ["--alert", "#B3402A"],
      ["--hero", "#242320"],
      ["--hero-ink", "#F7F6F2"],
      ["--r-card", "24px"],
      ["--r-lg", "28px"],
      ["--r-thumb", "18px"],
      ["--gutter", "20px"],
      ["--ease", "cubic-bezier(.16, 1, .3, 1)"],
      ["--t", "380ms"],
      ["--top-h", "60px"],
    ];
    for (const [name, val] of lightTokens) {
      expect(RESKIN_TOKENS_CSS).toContain(`${name}: ${val};`);
    }
  });

  it("dark theme values match prototype app.css exactly", () => {
    const darkTokens = [
      ["--paper", "#1C1B19"],
      ["--panel", "#2E2D2A"],
      ["--card", "#252421"],
      ["--stroke", "#3A3935"],
      ["--ink", "#F4F2EC"],
      ["--quiet", "#B6BBC3"],
      ["--rule", "#6B6964"],
      ["--seg-off", "#403F3A"],
      ["--alert", "#E0694E"],
      ["--hero", "#131211"],
    ];
    for (const [name, val] of darkTokens) {
      expect(RESKIN_TOKENS_CSS).toContain(`${name}: ${val};`);
    }
  });

  it("supports both prefers-color-scheme and data-theme/data-mode selectors", () => {
    expect(RESKIN_TOKENS_CSS).toContain("@media (prefers-color-scheme: dark)");
    expect(RESKIN_TOKENS_CSS).toContain(':root[data-theme="dark"]');
    expect(RESKIN_TOKENS_CSS).toContain(':root[data-mode="dark"]');
    expect(RESKIN_TOKENS_CSS).toContain(':root[data-theme="light"]');
    expect(RESKIN_TOKENS_CSS).toContain(':root[data-mode="light"]');
  });

  it("preserves responsive gutter and top-h overrides", () => {
    expect(RESKIN_TOKENS_CSS).toContain("@media (min-width: 760px) { :root { --gutter: 32px; --top-h: 72px; } }");
    expect(RESKIN_TOKENS_CSS).toContain("@media (min-width: 1100px) { :root { --gutter: 48px; } }");
  });
});

describe("Milestone 1: Theme switching logic", () => {
  const store = new Map<string, string>();
  const dataset: Record<string, string | undefined> = {};

  beforeEach(() => {
    store.clear();
    for (const key of Object.keys(dataset)) {
      delete dataset[key];
    }

    (globalThis as any).document = {
      documentElement: {
        dataset,
        removeAttribute: (attr: string) => {
          if (attr.startsWith("data-")) {
            delete dataset[attr.slice(5)];
          }
        },
      },
      querySelector: () => null,
    };

    (globalThis as any).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, String(v)),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
      },
      dispatchEvent: () => true,
      matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    };
  });

  it("applyThemeChoice updates both data-mode and data-theme", () => {
    applyThemeChoice("dark");
    expect(document.documentElement.dataset.mode).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    applyThemeChoice("light");
    expect(document.documentElement.dataset.mode).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    applyThemeChoice("system");
    expect(document.documentElement.dataset.mode).toBeUndefined();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("setThemeChoice persists to localStorage and announces appearance change", () => {
    setThemeChoice("dark");
    expect(readThemeChoice()).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
