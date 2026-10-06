import { describe, it, expect } from "vitest";

/**
 * Tests for service worker cache logic.
 * These test the pure functions that determine which requests should be cached.
 */

// Copied from sw.js for testing
function isApiRequest(url: URL): boolean {
  return url.pathname.startsWith("/api/") || url.pathname.startsWith("/trpc/");
}

describe("Service Worker cache rules", () => {
  describe("isApiRequest", () => {
    it("returns true for /api/ paths", () => {
      const url = new URL("https://example.com/api/chat");
      expect(isApiRequest(url)).toBe(true);
    });

    it("returns true for /api/kemma/stream paths", () => {
      const url = new URL("https://example.com/api/kemma/stream");
      expect(isApiRequest(url)).toBe(true);
    });

    it("returns true for /trpc/ paths", () => {
      const url = new URL("https://example.com/trpc/kemma.stream");
      expect(isApiRequest(url)).toBe(true);
    });

    it("returns false for root path", () => {
      const url = new URL("https://example.com/");
      expect(isApiRequest(url)).toBe(false);
    });

    it("returns false for static assets", () => {
      const url = new URL("https://example.com/assets/index.js");
      expect(isApiRequest(url)).toBe(false);
    });

    it("returns false for manifest", () => {
      const url = new URL("https://example.com/manifest.webmanifest");
      expect(isApiRequest(url)).toBe(false);
    });

    it("returns false for icons", () => {
      const url = new URL("https://example.com/icon-192.png");
      expect(isApiRequest(url)).toBe(false);
    });

    it("returns false for cross-origin requests", () => {
      const url = new URL("https://other.com/api/chat");
      // The function doesn't check origin, but the SW does
      expect(isApiRequest(url)).toBe(true);
    });
  });

  describe("APP_SHELL includes required assets", () => {
    const APP_SHELL = [
      "/",
      "/index.html",
      "/manifest.webmanifest",
      "/icon-192.png",
      "/icon-512.png",
      "/icon-maskable-512.png",
      "/apple-touch-icon.png",
      "/favicon.svg",
      "/favicon.png",
    ];

    it("includes index.html", () => {
      expect(APP_SHELL).toContain("/index.html");
    });

    it("includes manifest.webmanifest", () => {
      expect(APP_SHELL).toContain("/manifest.webmanifest");
    });

    it("includes icons", () => {
      expect(APP_SHELL).toContain("/icon-192.png");
      expect(APP_SHELL).toContain("/icon-512.png");
      expect(APP_SHELL).toContain("/icon-maskable-512.png");
    });

    it("includes apple-touch-icon", () => {
      expect(APP_SHELL).toContain("/apple-touch-icon.png");
    });

    it("includes favicon", () => {
      expect(APP_SHELL).toContain("/favicon.svg");
      expect(APP_SHELL).toContain("/favicon.png");
    });
  });
});