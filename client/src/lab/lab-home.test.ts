import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeScreen } from "@/components/home/HomeScreen";
import type { HomeComposerProps } from "@/components/home/HomeComposer";
import { HOME_LAB_STATES, LAB_HOME_SOURCES, homeLabComposer } from "./fixtures/home";

const noop = () => {};

function composerProps(state: Parameters<typeof homeLabComposer>[0]): HomeComposerProps {
  return {
    ...homeLabComposer(state),
    onChange: noop,
    onSubmit: noop,
    onListen: noop,
    onStopListen: noop,
    onModeChange: noop,
    onOpenSettings: noop,
    onThinkingChange: noop,
    onPrivateChange: noop,
    onToggleTool: noop,
    sourceRows: LAB_HOME_SOURCES,
    onAddAttachment: noop,
    onRemoveAttachment: noop,
  };
}

function render(state: Parameters<typeof homeLabComposer>[0]) {
  return renderToStaticMarkup(
    React.createElement(HomeScreen, { composer: composerProps(state), listening: state === "recording" })
  );
}

/**
 * Every state the Home lab route can be opened with has to render, and render as that
 * state — otherwise the route is decoration.
 */
describe("Home lab states", () => {
  it("lists the states the task asks for", () => {
    for (const state of ["typing", "files", "mode", "recording", "offline"]) {
      expect(HOME_LAB_STATES).toContain(state);
    }
  });

  it.each(HOME_LAB_STATES)("renders /__lab/home?state=%s with the screen's own markup", (state) => {
    const html = render(state);
    expect(html).toContain('class="view home view-enter');
    expect(html).toContain("mode-chip");
    // Home is the mark, the wordmark, the ramp and the composer, nothing else.
    expect(html).not.toContain("Recently updated");
    expect(html).not.toContain("Hand off a project");
  });

  it("shows each state as the state it names", () => {
    expect(render("typing")).toContain("How fast do commercial rooftop systems pay back?");

    const files = render("files");
    expect(files).toContain("supplier_quotes.pdf");
    expect(files).toContain("Uploading");

    const recording = render("recording");
    expect(recording).toContain('class="composer-wrap is-on listening"');
    expect(recording).toContain('placeholder="Listening…"');

    expect(render("offline")).toContain("Ask now. It sends when you reconnect.");
    expect(render("deep")).toContain("Deep research");
    expect(render("image")).toContain("Image");
  });
});
