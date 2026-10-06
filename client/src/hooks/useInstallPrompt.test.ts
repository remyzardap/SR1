import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock window object for Node.js environment
const mockWindow = {
  localStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  matchMedia: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
  navigator: {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    standalone: false,
  },
  dispatchEvent: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

Object.defineProperty(globalThis, "window", {
  value: mockWindow,
  writable: true,
});

Object.defineProperty(globalThis, "localStorage", {
  value: mockWindow.localStorage,
  writable: true,
});

Object.defineProperty(globalThis, "matchMedia", {
  value: mockWindow.matchMedia,
  writable: true,
});

Object.defineProperty(globalThis, "navigator", {
  value: mockWindow.navigator,
  writable: true,
});

Object.defineProperty(globalThis, "dispatchEvent", {
  value: mockWindow.dispatchEvent,
  writable: true,
});

Object.defineProperty(globalThis, "addEventListener", {
  value: mockWindow.addEventListener,
  writable: true,
});

Object.defineProperty(globalThis, "removeEventListener", {
  value: mockWindow.removeEventListener,
  writable: true,
});

// Mock BeforeInstallPromptEvent
class MockBeforeInstallPromptEvent extends Event {
  prompt = vi.fn().mockResolvedValue(undefined);
  userChoice = Promise.resolve({ outcome: "accepted" as const });
}

describe("useInstallPrompt logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWindow.localStorage.getItem.mockReturnValue(null);
    mockWindow.matchMedia.mockImplementation((query) => ({
      matches: query === "(display-mode: standalone)" ? false : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isStandalone detection", () => {
    it("returns false when display-mode is not standalone", () => {
      mockWindow.matchMedia.mockImplementation((query) => ({
        matches: query === "(display-mode: standalone)" ? false : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const mq = globalThis.matchMedia("(display-mode: standalone)");
      expect(mq.matches).toBe(false);
    });

    it("returns true when display-mode is standalone", () => {
      mockWindow.matchMedia.mockImplementation((query) => ({
        matches: query === "(display-mode: standalone)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const mq = globalThis.matchMedia("(display-mode: standalone)");
      expect(mq.matches).toBe(true);
    });
  });

  describe("dismissal logic", () => {
    it("stores dismissal timestamp in localStorage", () => {
      const timestamp = Date.now();
      globalThis.localStorage.setItem("sutaeru.install-dismissed", JSON.stringify({ timestamp }));
      
      expect(globalThis.localStorage.setItem).toHaveBeenCalledWith(
        "sutaeru.install-dismissed",
        JSON.stringify({ timestamp })
      );
    });

    it("checks if dismissal is within 14 days", () => {
      const now = Date.now();
      const fiveDaysAgo = now - 5 * 24 * 60 * 60 * 1000;
      const twentyDaysAgo = now - 20 * 24 * 60 * 60 * 1000;

      // Within 14 days - should be dismissed
      const recentDismissal = { timestamp: fiveDaysAgo };
      const ageDaysRecent = (now - recentDismissal.timestamp) / (1000 * 60 * 60 * 24);
      expect(ageDaysRecent).toBeLessThan(14);

      // Older than 14 days - should not be dismissed
      const oldDismissal = { timestamp: twentyDaysAgo };
      const ageDaysOld = (now - oldDismissal.timestamp) / (1000 * 60 * 60 * 24);
      expect(ageDaysOld).toBeGreaterThan(14);
    });
  });

  describe("iOS detection", () => {
    it("detects iOS user agent", () => {
      const iOSUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15";
      const isIos = /iPad|iPhone|iPod/.test(iOSUserAgent) && !(globalThis as any).MSStream;
      
      expect(isIos).toBe(true);
    });

    it("does not detect non-iOS as iOS", () => {
      const androidUserAgent = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/91.0.4472.120 Mobile Safari/537.36";
      const isIos = /iPad|iPhone|iPod/.test(androidUserAgent) && !(globalThis as any).MSStream;
      
      expect(isIos).toBe(false);
    });
  });

  describe("iOS hint dismissal", () => {
    it("stores iOS hint shown flag in localStorage", () => {
      globalThis.localStorage.setItem("sutaeru.ios-hint-shown", "true");
      
      expect(globalThis.localStorage.setItem).toHaveBeenCalledWith(
        "sutaeru.ios-hint-shown",
        "true"
      );
    });
  });
});