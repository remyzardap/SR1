import { describe, expect, it } from "vitest";
import {
  DISMISSAL_DAYS,
  DISMISSAL_KEY,
  IOS_HINT_KEY,
  collectInstallFacts,
  decideInstall,
  dismissalActive,
  isIosSafariFrom,
  isStandaloneFrom,
  markIosHintShown,
  readDismissalAt,
  readIosHintShown,
  writeDismissal,
  type InstallFacts,
  type InstallPromptWindow,
} from "../lib/installPrompt";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 12, 9, 0, 0);

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    values,
  };
}

function facts(overrides: Partial<InstallFacts> = {}): InstallFacts {
  return {
    displayModeStandalone: false,
    iosStandaloneAtom: false,
    hasPromptEvent: false,
    installed: false,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    maxTouchPoints: 0,
    hasMsStream: false,
    dismissedAt: null,
    iosHintShown: false,
    requestingIosHint: false,
    now: NOW,
    ...overrides,
  };
}

describe("dismissal window", () => {
  it("keeps the card hidden for the whole 14 days the task asks for", () => {
    // Fourteen days spelled out, plus the constant pinned to the same number.
    // Deriving the expectation from `DISMISSAL_DAYS` alone would let the window
    // drift to any other value without a single test failing.
    const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
    expect(DISMISSAL_DAYS).toBe(14);
    expect(dismissalActive(NOW - 1, NOW)).toBe(true);
    expect(dismissalActive(NOW - 6 * DAY_MS, NOW)).toBe(true);
    expect(dismissalActive(NOW - (FOURTEEN_DAYS - 1), NOW)).toBe(true);
  });

  it("lets the card come back once the window has passed", () => {
    const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
    expect(dismissalActive(NOW - FOURTEEN_DAYS, NOW)).toBe(false);
    expect(dismissalActive(NOW - (FOURTEEN_DAYS + 1), NOW)).toBe(false);
    expect(dismissalActive(NOW - 60 * DAY_MS, NOW)).toBe(false);
  });

  it("treats a missing record as no dismissal", () => {
    expect(dismissalActive(null, NOW)).toBe(false);
  });

  it("treats a timestamp in the future as bad data rather than silence", () => {
    expect(dismissalActive(NOW + DAY_MS, NOW)).toBe(false);
  });
});

describe("reading the dismissal from storage", () => {
  it("reads the timestamp this app writes", () => {
    const store = storage();
    writeDismissal(store, NOW);
    expect(JSON.parse(store.values.get(DISMISSAL_KEY) as string)).toEqual({ timestamp: NOW });
    expect(readDismissalAt(store)).toBe(NOW);
  });

  it("ignores a missing key, absent storage and unparseable JSON", () => {
    expect(readDismissalAt(storage())).toBeNull();
    expect(readDismissalAt(undefined)).toBeNull();
    expect(readDismissalAt(null)).toBeNull();
    expect(readDismissalAt(storage({ [DISMISSAL_KEY]: "not json" }))).toBeNull();
    expect(readDismissalAt(storage({ [DISMISSAL_KEY]: "null" }))).toBeNull();
    expect(readDismissalAt(storage({ [DISMISSAL_KEY]: "[]" }))).toBeNull();
  });

  it("ignores a record whose timestamp is not a usable number", () => {
    expect(readDismissalAt(storage({ [DISMISSAL_KEY]: "{}" }))).toBeNull();
    expect(readDismissalAt(storage({ [DISMISSAL_KEY]: '{"timestamp":"1700000000000"}' }))).toBeNull();
    expect(readDismissalAt(storage({ [DISMISSAL_KEY]: '{"timestamp":null}' }))).toBeNull();
    expect(readDismissalAt(storage({ [DISMISSAL_KEY]: '{"timestamp":1e999}' }))).toBeNull();
  });

  it("survives storage that throws, which private-mode Safari does", () => {
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(readDismissalAt(blocked)).toBeNull();
    expect(() => writeDismissal(blocked, NOW)).not.toThrow();
    expect(() => markIosHintShown(blocked)).not.toThrow();
  });
});

describe("the iOS hint record", () => {
  it("counts any recorded value as already shown", () => {
    expect(readIosHintShown(storage())).toBe(false);
    expect(readIosHintShown(storage({ [IOS_HINT_KEY]: "true" }))).toBe(true);
    expect(readIosHintShown(storage({ [IOS_HINT_KEY]: "yes" }))).toBe(true);
    expect(readIosHintShown(storage({ [IOS_HINT_KEY]: "" }))).toBe(false);
    expect(readIosHintShown(undefined)).toBe(false);
  });

  it("marks itself shown so a later reload stays quiet", () => {
    const store = storage();
    expect(readIosHintShown(store)).toBe(false);
    markIosHintShown(store);
    expect(readIosHintShown(store)).toBe(true);
  });
});

describe("running as an installed app", () => {
  it("is standalone via either the media query or the iOS atom", () => {
    expect(isStandaloneFrom(true, false)).toBe(true);
    expect(isStandaloneFrom(false, true)).toBe(true);
    expect(isStandaloneFrom(true, true)).toBe(true);
    expect(isStandaloneFrom(false, false)).toBe(false);
  });
});

describe("iOS Safari detection", () => {
  const IPHONE_SAFARI =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const IPAD_SAFARI =
    "Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1";
  // iPadOS 13+ asks for the desktop-class page, so the UA says "Macintosh" and
  // the only tell left is that a "Mac" reports a touch screen.
  const IPAD_OS_DESKTOP_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
  const MAC_SAFARI = IPAD_OS_DESKTOP_UA;
  const IPHONE_CHROME =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.7444.173 Mobile/15E148 Safari/604.1";
  const IPHONE_FIREFOX =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/142.0 Mobile/15E148 Safari/605.1.15";
  const WINDOWS_CHROME = facts().userAgent;
  const ANDROID_CHROME =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";

  it("recognises the devices whose browser can actually install", () => {
    expect(isIosSafariFrom(IPHONE_SAFARI, 5, false)).toBe(true);
    expect(isIosSafariFrom(IPAD_SAFARI, 5, false)).toBe(true);
    expect(isIosSafariFrom(IPAD_OS_DESKTOP_UA, 5, false)).toBe(true);
  });

  it("does not mistake a real Mac for an iPad", () => {
    expect(isIosSafariFrom(MAC_SAFARI, 0, false)).toBe(false);
  });

  it("does not hint on iOS browsers that cannot install", () => {
    expect(isIosSafariFrom(IPHONE_CHROME, 5, false)).toBe(false);
    expect(isIosSafariFrom(IPHONE_FIREFOX, 5, false)).toBe(false);
  });

  it("does not hint on desktop or Android, which use beforeinstallprompt", () => {
    expect(isIosSafariFrom(WINDOWS_CHROME, 0, false)).toBe(false);
    expect(isIosSafariFrom(ANDROID_CHROME, 5, false)).toBe(false);
  });

  it("does not hint on a Windows phone pretending to be Safari", () => {
    expect(isIosSafariFrom(IPHONE_SAFARI, 5, true)).toBe(false);
  });
});

describe("deciding what to show", () => {
  it("shows the install card when the browser handed over a prompt event", () => {
    expect(decideInstall(facts({ hasPromptEvent: true }))).toEqual({
      showInstall: true,
      showIosHint: false,
    });
  });

  it("shows nothing while the app already runs as installed", () => {
    for (const standalone of [true, false]) {
      expect(decideInstall(facts({ displayModeStandalone: standalone, hasPromptEvent: true }))).toEqual(
        standalone
          ? { showInstall: false, showIosHint: false }
          : { showInstall: true, showIosHint: false }
      );
    }
    expect(decideInstall(facts({ iosStandaloneAtom: true, hasPromptEvent: true }))).toEqual({
      showInstall: false,
      showIosHint: false,
    });
    expect(decideInstall(facts({ installed: true, hasPromptEvent: true }))).toEqual({
      showInstall: false,
      showIosHint: false,
    });
  });

  it("honours a live dismissal over a fresh prompt event", () => {
    expect(decideInstall(facts({ hasPromptEvent: true, dismissedAt: NOW - DAY_MS }))).toEqual({
      showInstall: false,
      showIosHint: false,
    });
  });

  it("shows the manual hint on iOS Safari, where no prompt event ever arrives", () => {
    const ios = facts({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      maxTouchPoints: 5,
      requestingIosHint: true,
    });
    expect(decideInstall(ios)).toEqual({ showInstall: false, showIosHint: true });
    expect(decideInstall({ ...ios, iosHintShown: true })).toEqual({
      showInstall: false,
      showIosHint: false,
    });
    expect(decideInstall({ ...ios, dismissedAt: NOW - DAY_MS })).toEqual({
      showInstall: false,
      showIosHint: false,
    });
  });

  it("waits for an install request before putting the hint on screen", () => {
    const ios = facts({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      maxTouchPoints: 5,
    });
    expect(decideInstall(ios)).toEqual({ showInstall: false, showIosHint: false });
  });

  it("prefers the install card over the hint when both are possible", () => {
    const ipad = facts({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
      maxTouchPoints: 5,
      hasPromptEvent: true,
      requestingIosHint: true,
    });
    expect(decideInstall(ipad)).toEqual({ showInstall: true, showIosHint: false });
  });

  it("shows nothing on a browser that has no prompt to offer", () => {
    expect(decideInstall(facts())).toEqual({ showInstall: false, showIosHint: false });
  });
});

describe("reading the facts off a window", () => {
  const extras = {
    hasPromptEvent: false,
    installed: false,
    dismissedAt: null,
    iosHintShown: false,
    requestingIosHint: false,
  };

  function windowLike(
    over: Partial<{
      standaloneMedia: boolean;
      iosAtom: boolean;
      userAgent: string;
      maxTouchPoints: number | undefined;
    }> = {}
  ): InstallPromptWindow {
    return {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      matchMedia: (query: string) => ({
        matches: query === "(display-mode: standalone)" && over.standaloneMedia === true,
      }),
      navigator: {
        userAgent: over.userAgent ?? "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36",
        maxTouchPoints: over.maxTouchPoints,
        standalone: over.iosAtom,
      },
      localStorage: storage(),
    } as unknown as InstallPromptWindow;
  }

  it("treats a missing window as an app that cannot be installed", () => {
    // Server-side rendering has no browser to read from; deciding there would show a
    // card that a hydration pass would have to take away again.
    expect(collectInstallFacts(null, extras, NOW).installed).toBe(true);
    expect(decideInstall(collectInstallFacts(null, extras, NOW))).toEqual({
      showInstall: false,
      showIosHint: false,
    });
  });

  it("reads the display mode from both signals", () => {
    expect(collectInstallFacts(windowLike({ standaloneMedia: true }), extras, NOW).displayModeStandalone).toBe(true);
    expect(collectInstallFacts(windowLike({ iosAtom: true }), extras, NOW).iosStandaloneAtom).toBe(true);
    expect(collectInstallFacts(windowLike(), extras, NOW).displayModeStandalone).toBe(false);
  });

  it("copes with a browser that has no touch-point count", () => {
    const read = collectInstallFacts(windowLike({ maxTouchPoints: undefined }), extras, NOW);
    expect(read.maxTouchPoints).toBe(0);
    expect(read.hasMsStream).toBe(false);
  });

  it("passes through what only the controller knows", () => {
    const read = collectInstallFacts(
      windowLike(),
      { ...extras, hasPromptEvent: true, iosHintShown: true, requestingIosHint: true, dismissedAt: NOW - DAY_MS },
      NOW
    );
    expect(read).toMatchObject({
      hasPromptEvent: true,
      iosHintShown: true,
      requestingIosHint: true,
      dismissedAt: NOW - DAY_MS,
      now: NOW,
    });
  });
});
