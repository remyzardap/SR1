import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { REDUCE_MOTION_STORAGE_KEY } from "@/components/art/useMotion";
import {
  APPEARANCE_EVENT,
  ART_INTENSITY_DEFAULT,
  ART_INTENSITY_MAX,
  ART_INTENSITY_MIN,
  ART_INTENSITY_STORAGE_KEY,
  BG_ART_STORAGE_KEY,
  THEME_STORAGE_KEY,
  VOICE_DEFAULT,
  VOICE_STORAGE_KEY,
  applyAppearance,
  applyArtIntensity,
  applyBackgroundArt,
  applyReduceMotion,
  applyThemeChoice,
  currentMode,
  readArtIntensity,
  readBackgroundArt,
  readThemeChoice,
  readVoiceStyle,
  setArtIntensity,
  setBackgroundArt,
  setReduceMotion,
  setThemeChoice,
  setVoiceStyle,
} from "./theme";

/**
 * theme.ts only ever talks to <html> and localStorage, so these tests hand it the
 * smallest stub of both and watch what it writes. (`environment: "node"` in
 * vitest.config.ts — there is no DOM here.)
 */
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

let saved: Record<string, string>;
let dispatchEvent: ReturnType<typeof vi.fn>;
let darkPreference: boolean;

/**
 * The `<html>` stub has to be one object for the whole file — `globalThis.document` is
 * rebuilt in `beforeEach` but keeps pointing at these maps, so a test that wants a blank
 * page clears them in place rather than making a new object.
 */
const html: { dataset: Record<string, string | undefined>; style: Record<string, string> } = {
  dataset: {},
  style: {},
};

function blankHtml() {
  for (const key of Object.keys(html.dataset)) delete html.dataset[key];
  for (const key of Object.keys(html.style)) delete html.style[key];
}

beforeEach(() => {
  saved = {};
  blankHtml();
  dispatchEvent = vi.fn();
  darkPreference = false;

  // @ts-expect-error minimal document for theme.ts
  globalThis.document = {
    documentElement: {
      dataset: html.dataset,
      style: {
        setProperty: (name: string, value: string) => {
          html.style[name] = value;
        },
      },
    },
    querySelector: () => null, // no <meta name="theme-color"> stubbed: syncThemeColor skips it
  };
  // @ts-expect-error minimal window for theme.ts
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => (key in saved ? saved[key] : null),
      setItem: (key: string, value: string) => {
        saved[key] = String(value);
      },
      removeItem: (key: string) => {
        delete saved[key];
      },
    },
    matchMedia: (query: string) => ({ matches: query.includes("dark") && darkPreference }),
    dispatchEvent,
  };
});

afterEach(() => {
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
});

describe("storage keys", () => {
  it("are the ones client/index.html reads before the first paint", () => {
    // Keep in step with the inline script in client/index.html: if a key changes there
    // and not here, the pre-paint restore silently stops working.
    expect(THEME_STORAGE_KEY).toBe("sutaeru.theme");
    expect(BG_ART_STORAGE_KEY).toBe("sutaeru.background-art");
    expect(ART_INTENSITY_STORAGE_KEY).toBe("sutaeru.art-intensity");
    expect(VOICE_STORAGE_KEY).toBe("sutaeru.voice");
    expect(REDUCE_MOTION_STORAGE_KEY).toBe("sutaeru.reduce-motion");
  });
});

describe("theme choice", () => {
  it("pins the palette and persists it", () => {
    setThemeChoice("dark");
    expect(saved[THEME_STORAGE_KEY]).toBe("dark");
    expect(html.dataset.theme).toBe("dark");
    expect(html.dataset.mode).toBe("dark");
  });

  it("lets System choose nothing, so the OS media query decides", () => {
    setThemeChoice("dark");
    setThemeChoice("system");
    expect(saved[THEME_STORAGE_KEY]).toBe("system");
    expect(html.dataset).not.toHaveProperty("theme");
    expect(html.dataset).not.toHaveProperty("mode");
  });

  it("reads the palette actually on screen", () => {
    setThemeChoice("system");
    expect(currentMode()).toBe("light");
    darkPreference = true;
    expect(currentMode()).toBe("dark");
    setThemeChoice("light");
    expect(currentMode()).toBe("light"); // a pinned light beats a dark OS
  });

  it("falls back to System on a stored value that is not a theme", () => {
    saved[THEME_STORAGE_KEY] = "hot-magenta";
    expect(readThemeChoice()).toBe("system");
  });
});

describe("background art", () => {
  it("writes both attributes and the key", () => {
    setBackgroundArt(false);
    expect(saved[BG_ART_STORAGE_KEY]).toBe("off");
    expect(html.dataset.art).toBe("off"); // redo grain/dither rules
    expect(html.dataset.bgArt).toBe("off"); // older chat chrome
    setBackgroundArt(true);
    expect(html.dataset.art).toBe("on");
  });

  it("treats anything but a stored 'off' as on", () => {
    saved[BG_ART_STORAGE_KEY] = "nonsense";
    expect(readBackgroundArt()).toBe(true);
  });

  it("applying it does not persist anything", () => {
    applyBackgroundArt(false);
    expect(html.dataset.art).toBe("off");
    expect(saved).not.toHaveProperty(BG_ART_STORAGE_KEY);
  });
});

describe("art intensity", () => {
  it("publishes the 0.2 – 1 multiplier the grain and the canvases scale by", () => {
    setArtIntensity(50);
    expect(saved[ART_INTENSITY_STORAGE_KEY]).toBe("50");
    expect(html.style["--art-intensity"]).toBe("0.5");
  });

  it("clamps to the slider's range", () => {
    setArtIntensity(ART_INTENSITY_MIN - 50);
    expect(saved[ART_INTENSITY_STORAGE_KEY]).toBe(String(ART_INTENSITY_MIN));
    expect(html.style["--art-intensity"]).toBe("0.2");
    setArtIntensity(ART_INTENSITY_MAX + 50);
    expect(saved[ART_INTENSITY_STORAGE_KEY]).toBe(String(ART_INTENSITY_MAX));
    expect(html.style["--art-intensity"]).toBe("1");
  });

  it("falls back to the default on junk instead of throwing", () => {
    saved[ART_INTENSITY_STORAGE_KEY] = "banana";
    expect(readArtIntensity()).toBe(ART_INTENSITY_DEFAULT);
  });

  it("applying it does not persist anything", () => {
    applyArtIntensity(35);
    expect(html.style["--art-intensity"]).toBe("0.35");
    expect(saved[ART_INTENSITY_STORAGE_KEY]).toBeUndefined();
  });
});

describe("reduce motion", () => {
  it("shares the key useMotion.ts reads and lands on <html>", () => {
    setReduceMotion(true);
    expect(saved[REDUCE_MOTION_STORAGE_KEY]).toBe("true");
    expect(html.dataset.reduceMotion).toBe("true");
    setReduceMotion(false);
    expect(saved[REDUCE_MOTION_STORAGE_KEY]).toBe("false");
    expect(html.dataset).not.toHaveProperty("reduceMotion");
  });

  it("can be mirrored onto the page without saving a choice (the lab needs this)", () => {
    applyReduceMotion(true);
    expect(html.dataset.reduceMotion).toBe("true");
    expect(saved[REDUCE_MOTION_STORAGE_KEY]).toBeUndefined();
  });
});

describe("how sutaeru talks", () => {
  it("persists both sliders as one JSON value", () => {
    setVoiceStyle({ detail: 5, tone: 95 });
    expect(JSON.parse(saved[VOICE_STORAGE_KEY])).toEqual({ detail: 5, tone: 95 });
    expect(readVoiceStyle()).toEqual({ detail: 5, tone: 95 });
  });

  it("clamps each slider into 0 – 100", () => {
    setVoiceStyle({ detail: -30, tone: 400 });
    expect(readVoiceStyle()).toEqual({ detail: 0, tone: 100 });
  });

  it("repairs junk instead of throwing", () => {
    saved[VOICE_STORAGE_KEY] = "{not json";
    expect(readVoiceStyle()).toEqual(VOICE_DEFAULT);
    saved[VOICE_STORAGE_KEY] = JSON.stringify({ detail: "x" });
    expect(readVoiceStyle()).toEqual(VOICE_DEFAULT);
  });
});

describe("restoring a session", () => {
  it("applyAppearance puts every saved choice back on <html>", () => {
    // The round trip a reload makes: setters write, applyAppearance reads.
    setThemeChoice("dark");
    setBackgroundArt(false);
    setArtIntensity(45);
    setReduceMotion(true);
    setVoiceStyle({ detail: 80, tone: 10 });

    blankHtml(); // a fresh document, as if nothing had been applied yet
    applyAppearance();

    expect(html.dataset.theme).toBe("dark");
    expect(html.dataset.art).toBe("off");
    expect(html.style["--art-intensity"]).toBe("0.45");
    expect(html.dataset.reduceMotion).toBe("true");
    expect(readVoiceStyle()).toEqual({ detail: 80, tone: 10 });
  });

  it("is quiet when nothing changed, and announces every setter that repaints the page", () => {
    applyThemeChoice("dark");
    applyBackgroundArt(true);
    applyArtIntensity(70);
    applyReduceMotion(false);
    expect(dispatchEvent).not.toHaveBeenCalled();

    setThemeChoice("light");
    setBackgroundArt(false);
    setArtIntensity(80);
    setReduceMotion(true);
    expect(dispatchEvent).toHaveBeenCalledTimes(4);
    expect(dispatchEvent.mock.calls.map(([event]) => (event as Event).type)).toEqual(
      Array(4).fill(APPEARANCE_EVENT)
    );
  });

  it("leaves the voice sliders silent — the screen re-renders its own sample", () => {
    setVoiceStyle({ detail: 10, tone: 20 });
    expect(saved[VOICE_STORAGE_KEY]).toBe(JSON.stringify({ detail: 10, tone: 20 }));
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
