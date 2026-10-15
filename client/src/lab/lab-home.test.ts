import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeScreen, DEFAULT_HOME_MODES } from "@/components/home/HomeScreen";
import { HOME_LAB_STATES, LAB_HOME_WIDTHS, homeLabComposer } from "./fixtures/home";

const noop = () => {};

function render(state: Parameters<typeof homeLabComposer>[0]) {
  const comp = homeLabComposer(state);
  return renderToStaticMarkup(
    React.createElement(HomeScreen, {
      modes: DEFAULT_HOME_MODES,
      activeModeIndex: state === "deep" ? 3 : state === "image" ? 2 : 0,
      listening: state === "recording",
      composer: {
        value: comp.value,
        listening: comp.listening,
        offline: comp.offline,
        privateChat: comp.privateChat,
        attachments: comp.attachments,
        onChange: noop,
        onSubmit: noop,
        onListen: noop,
        onStopListen: noop,
        onAddAttachment: noop,
        onRemoveAttachment: noop,
      },
    })
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
    expect(html).toContain('class="home');
    expect(html).toContain('aria-label="Mode"');
    // Home is Quiet: hero artifacts, center mark, composer, nothing else.
    expect(html).not.toContain("Recently updated");
    expect(html).not.toContain("Hand off a project");
  });

  it("shows each state as the state it names", () => {
    expect(render("typing")).toContain("How fast do commercial rooftop systems pay back?");

    const files = render("files");
    expect(files).toContain("supplier_quotes.pdf");
    expect(files).toContain("2.4 MB");

    const recording = render("recording");
    expect(recording).toContain('placeholder="Listening…"');
    expect(recording).toContain('aria-label="Stop listening"');

    expect(render("offline")).toContain("Ask now. It sends when you reconnect.");
    expect(render("private")).toContain("home private-on");
  });

  it("includes width fixtures for 360, 390, and 1280", () => {
    expect(LAB_HOME_WIDTHS).toEqual([360, 390, 1280]);
  });
});
