import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { HomeScreen } from "@/components/home/HomeScreen";
import type { HomeComposerProps } from "@/components/home/HomeComposer";
import LabHome from "./LabHome";
import { HOME_LAB_STATES, LAB_HOME_SOURCES, homeLabComposer, homeLabRows } from "./fixtures/home";

const noop = () => {};

function composerProps(state: Parameters<typeof homeLabComposer>[0]): HomeComposerProps {
  return {
    ...homeLabComposer(state),
    onChange: noop,
    onSubmit: noop,
    onListen: noop,
    onStopListen: noop,
    onThinkingChange: noop,
    onPrivateChange: noop,
    onToggleTool: noop,
    sourceRows: LAB_HOME_SOURCES,
    onAddAttachment: noop,
    onRemoveAttachment: noop,
  };
}

/**
 * Every state the Home lab route can be opened with has to render, and render as that
 * state — otherwise the route is decoration.
 */
describe("Home lab states", () => {
  it("lists the states the task asks for", () => {
    for (const state of ["typing", "files", "recording", "no-recents", "loading", "offline"]) {
      expect(HOME_LAB_STATES).toContain(state);
    }
  });

  it.each(HOME_LAB_STATES)("renders /__lab/home?state=%s with the screen's own markup", (state) => {
    const html = renderToStaticMarkup(
      React.createElement(HomeScreen, {
        rows: homeLabRows(state),
        composer: composerProps(state),
        loading: state === "loading",
        listening: state === "recording",
        onHandoff: noop,
      })
    );
    expect(html).toContain('class="view home view-enter');
    expect(html).toContain("Recently updated");
    expect(html).toContain('class="handoff"');
  });

  it("shows each state as the state it names", () => {
    expect(renderToStaticMarkup(
      React.createElement(HomeScreen, { rows: homeLabRows("typing"), composer: composerProps("typing"), onHandoff: noop })
    )).toContain("How fast do commercial rooftop systems pay back?");

    const files = renderToStaticMarkup(
      React.createElement(HomeScreen, { rows: homeLabRows("files"), composer: composerProps("files"), onHandoff: noop })
    );
    expect(files).toContain("supplier_quotes.pdf");
    expect(files).toContain("Uploading");

    const recording = renderToStaticMarkup(
      React.createElement(HomeScreen, { rows: homeLabRows("recording"), composer: composerProps("recording"), listening: true, onHandoff: noop })
    );
    expect(recording).toContain('class="composer-wrap is-on listening"');
    expect(recording).toContain('placeholder="Listening…"');

    const empty = renderToStaticMarkup(
      React.createElement(HomeScreen, { rows: homeLabRows("no-recents"), composer: composerProps("no-recents"), onHandoff: noop })
    );
    expect(empty).toContain("Nothing here yet.");

    const loading = renderToStaticMarkup(
      React.createElement(HomeScreen, { rows: homeLabRows("loading"), composer: composerProps("loading"), loading: true, onHandoff: noop })
    );
    expect(loading).toContain('aria-busy="true"');

    const offline = renderToStaticMarkup(
      React.createElement(HomeScreen, { rows: homeLabRows("offline"), composer: composerProps("offline"), onHandoff: noop })
    );
    expect(offline).toContain("Ask now. It sends when you reconnect.");
    expect(offline).toContain("Waiting to send");

    const stopped = renderToStaticMarkup(
      React.createElement(HomeScreen, { rows: homeLabRows("stopped"), composer: composerProps("stopped"), onHandoff: noop })
    );
    expect(stopped).toContain('class="tag alert"');
  });
});
