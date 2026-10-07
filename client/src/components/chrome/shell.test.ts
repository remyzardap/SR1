import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { AppHeader } from "./AppHeader";
import { navigateWithTransition } from "@/lib/transitions";

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, isAuthenticated: false, loading: false }),
}));

describe("Shell and AppHeader", () => {
  it("top bar renders logo button, avatar button, crosshairs", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        Router,
        { ssrPath: "/settings" },
        React.createElement(AppHeader, { label: "Settings", userInitial: "R" })
      )
    );

    // Header has top shell class
    expect(html).toContain("top");
    // Logo button trigger present
    expect(html).toContain("logo-btn");
    // Avatar button present with initial
    expect(html).toContain("avatar");
    expect(html).toContain("R");
    // Crosshairs present
    expect(html).toContain("xhair");
    expect(html).toContain("skx-crosshair-tl");
    expect(html).toContain("skx-crosshair-tr");
  });

  it("mode switch renders Chat and Agent options on chat/agent routes", () => {
    // Explicit mode="chat"
    const chatHtml = renderToStaticMarkup(
      React.createElement(
        Router,
        { ssrPath: "/chat" },
        React.createElement(AppHeader, { mode: "chat" })
      )
    );
    expect(chatHtml).toContain('id="modeSeg"');
    expect(chatHtml).toContain("Chat");
    expect(chatHtml).toContain("Agent");
    expect(chatHtml).toContain('aria-pressed="true"');

    // Route inferred mode on /agent
    const agentRouteHtml = renderToStaticMarkup(
      React.createElement(
        Router,
        { ssrPath: "/agent" },
        React.createElement(AppHeader, {})
      )
    );
    expect(agentRouteHtml).toContain('id="modeSeg"');
    expect(agentRouteHtml).toContain("Chat");
    expect(agentRouteHtml).toContain("Agent");
  });

  it("mode switch renders title on other routes", () => {
    const settingsHtml = renderToStaticMarkup(
      React.createElement(
        Router,
        { ssrPath: "/settings" },
        React.createElement(AppHeader, { label: "Settings" })
      )
    );
    expect(settingsHtml).not.toContain('id="modeSeg"');
    expect(settingsHtml).toContain("Settings");
    expect(settingsHtml).toContain("top-title");

    const filesHtml = renderToStaticMarkup(
      React.createElement(
        Router,
        { ssrPath: "/files" },
        React.createElement(AppHeader, { title: "Files" })
      )
    );
    expect(filesHtml).not.toContain('id="modeSeg"');
    expect(filesHtml).toContain("Files");
  });

  describe("navigateWithTransition", () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    beforeEach(() => {
      // @ts-expect-error minimal mock
      globalThis.window = {
        matchMedia: vi.fn(() => ({ matches: false })),
      };
      // @ts-expect-error minimal mock
      globalThis.document = {
        documentElement: {
          getAttribute: vi.fn(() => null),
        },
      };
    });

    afterEach(() => {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
    });

    it("calls startViewTransition when available and motion is not reduced", () => {
      const navigateMock = vi.fn();
      const startViewTransitionMock = vi.fn((cb: () => void) => {
        cb();
      });

      // @ts-expect-error view transition mock
      globalThis.document.startViewTransition = startViewTransitionMock;

      navigateWithTransition(navigateMock, "/chat");

      expect(startViewTransitionMock).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith("/chat");
    });

    it("falls back gracefully when startViewTransition is not available", () => {
      const navigateMock = vi.fn();
      // startViewTransition is undefined on document
      delete (globalThis.document as unknown as Record<string, unknown>).startViewTransition;

      navigateWithTransition(navigateMock, "/agent");

      expect(navigateMock).toHaveBeenCalledWith("/agent");
    });

    it("skips startViewTransition when reduced motion is preferred", () => {
      const navigateMock = vi.fn();
      const startViewTransitionMock = vi.fn((cb: () => void) => {
        cb();
      });

      // @ts-expect-error view transition mock
      globalThis.document.startViewTransition = startViewTransitionMock;
      (globalThis.window.matchMedia as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        matches: true,
      });

      navigateWithTransition(navigateMock, "/files");

      // Must NOT call startViewTransition
      expect(startViewTransitionMock).not.toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith("/files");
    });
  });
});
