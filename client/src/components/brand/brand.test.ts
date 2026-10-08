import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SutaeruGlyph,
  SutaeruSeal,
  SutaeruStamp,
  BrandIntro,
  shouldPlayIntro,
  markIntroSeen,
  resetIntroSeen,
  INTRO_STORAGE_KEY,
} from "./index";

describe("Brand marks", () => {
  it("render glyph in compact mode -> no sun/sea/glint", () => {
    const html = renderToStaticMarkup(React.createElement(SutaeruGlyph, { detail: "compact" }));

    // Loop and torii gate are present
    expect(html).toContain("sutaeru-glyph-loop");
    expect(html).toContain("sutaeru-glyph-gate");

    // Sun, sea line, and glint must be omitted in compact mode
    expect(html).not.toContain("sutaeru-glyph-sun");
    expect(html).not.toContain("sutaeru-glyph-sea");
    expect(html).not.toContain("sutaeru-glyph-glint");
    expect(html).not.toContain("<circle");
  });

  it("render glyph in full mode -> includes sun, sea, glint", () => {
    const html = renderToStaticMarkup(React.createElement(SutaeruGlyph, { detail: "full" }));

    // Full detail must include loop, gate, sun, sea line, and water glint
    expect(html).toContain("sutaeru-glyph-loop");
    expect(html).toContain("sutaeru-glyph-gate");
    expect(html).toContain("sutaeru-glyph-sun");
    expect(html).toContain("<circle");
    expect(html).toContain("sutaeru-glyph-sea");
    expect(html).toContain("sutaeru-glyph-glint");
  });

  it("seal renders correct SVG structure (name seal and settled stamp)", () => {
    const sealHtml = renderToStaticMarkup(React.createElement(SutaeruSeal));
    expect(sealHtml).toContain('aria-label="スタエル"');
    expect(sealHtml).toContain("sutaeru-seal");
    expect(sealHtml).toContain("seal-ink");
    expect(sealHtml).toContain("<mask");

    const stampHtml = renderToStaticMarkup(React.createElement(SutaeruStamp));
    expect(stampHtml).toContain('aria-label="Done"');
    expect(stampHtml).toContain("sutaeru-stamp");
    expect(stampHtml).toContain("stamp-ink");
    expect(stampHtml).toContain("<circle");

    // Seal variant="settled" renders the stamp
    const variantStampHtml = renderToStaticMarkup(
      React.createElement(SutaeruSeal, { variant: "settled" })
    );
    expect(variantStampHtml).toContain('aria-label="Done"');
    expect(variantStampHtml).toContain("sutaeru-stamp");
  });

  describe("Brand intro skip & localStorage logic", () => {
    let mockStorage: Record<string, string> = {};
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    beforeEach(() => {
      mockStorage = {};
      const fakeLocalStorage = {
        getItem: vi.fn((key: string) => mockStorage[key] ?? null),
        setItem: vi.fn((key: string, val: string) => {
          mockStorage[key] = val;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        }),
        clear: vi.fn(() => {
          mockStorage = {};
        }),
      };

      const fakeDocElement = {
        getAttribute: vi.fn(() => null),
      };

      // @ts-expect-error minimal mock
      globalThis.window = {
        localStorage: fakeLocalStorage,
        matchMedia: vi.fn(() => ({ matches: false })),
      };

      // @ts-expect-error minimal mock
      globalThis.document = {
        documentElement: fakeDocElement,
      };
    });

    afterEach(() => {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
    });

    it("plays intro on first visit when motion is not reduced", () => {
      expect(shouldPlayIntro()).toBe(true);

      markIntroSeen();
      expect(globalThis.window.localStorage.getItem(INTRO_STORAGE_KEY)).toBe("1");

      // Once marked seen, intro should not play again
      expect(shouldPlayIntro()).toBe(false);

      resetIntroSeen();
      expect(shouldPlayIntro()).toBe(true);
    });

    it("skips intro when reduced motion is preferred via matchMedia", () => {
      (globalThis.window.matchMedia as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        matches: true,
      });

      expect(shouldPlayIntro()).toBe(false);
    });

    it("skips intro when data-reduce-motion is set to true on documentElement", () => {
      (globalThis.document.documentElement.getAttribute as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (attr: string) => (attr === "data-reduce-motion" ? "true" : null)
      );

      expect(shouldPlayIntro()).toBe(false);
    });

    it("BrandIntro renders intro class when forceIntro=true, no-intro when forceIntro=false", () => {
      const introHtml = renderToStaticMarkup(
        React.createElement(BrandIntro, { forceIntro: true })
      );
      expect(introHtml).toContain("intro");
      expect(introHtml).not.toContain("no-intro");

      const noIntroHtml = renderToStaticMarkup(
        React.createElement(BrandIntro, { forceIntro: false })
      );
      expect(noIntroHtml).toContain("no-intro");
    });
  });
});
