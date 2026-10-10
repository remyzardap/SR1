import { describe, it, expect } from "vitest";
import * as React from "react";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { SettingsView, SETTINGS_FOLD_IDS, voiceBucket, voiceSample, VOICE_SAMPLES } from "./SettingsView";
import { settingsFixture, type SettingsState } from "@/lab/fixtures/settings";

/**
 * SettingsView is presentational, so these are string assertions on rendered markup plus
 * the slider maths. There is no jsdom here (vitest.config.ts runs in node), so nothing
 * clicks a button — the lab at /__lab/settings is where the interactions get eyeballed.
 *
 * A closed fold renders nothing, so the markup tests ask for every section open.
 */

function render(state: SettingsState = "default"): string {
  return renderToStaticMarkup(
    React.createElement(
      Router,
      { ssrPath: "/settings" },
      React.createElement(SettingsView, { ...settingsFixture(state), openSections: SETTINGS_FOLD_IDS })
    )
  );
}

/** The same screen with its own accordion: what the real page does on a phone. */
function renderLive(state: SettingsState = "default"): string {
  return renderToStaticMarkup(
    React.createElement(Router, { ssrPath: "/settings" }, React.createElement(SettingsView, settingsFixture(state)))
  );
}

describe("voice sample maths", () => {
  it("buckets the sliders the way the prototype does", () => {
    expect(voiceBucket({ detail: 0, tone: 0 })).toEqual({ length: "concise", tone: "formal" });
    expect(voiceBucket({ detail: 33, tone: 33 })).toEqual({ length: "concise", tone: "formal" });
    expect(voiceBucket({ detail: 34, tone: 34 })).toEqual({ length: "balanced", tone: "neutral" });
    expect(voiceBucket({ detail: 66, tone: 66 })).toEqual({ length: "balanced", tone: "neutral" });
    expect(voiceBucket({ detail: 67, tone: 67 })).toEqual({ length: "detailed", tone: "casual" });
    expect(voiceBucket({ detail: 100, tone: 100 })).toEqual({ length: "detailed", tone: "casual" });
  });

  it("survives junk from storage", () => {
    // `clampSlider` turns NaN into 0, so a broken read lands on the lowest
    // bucket rather than throwing or printing `undefined`.
    expect(voiceSample({ detail: Number.NaN, tone: Number.NaN })).toBe(VOICE_SAMPLES.concise.formal);
    expect(voiceBucket({ detail: 500, tone: -30 })).toEqual({ length: "detailed", tone: "formal" });
  });
});

describe("the ported screen", () => {
  const html = render();

  it("keeps the prototype's heading and lede", () => {
    expect(html).toContain('class="view wide view-enter settings-view"');
    expect(html).toContain('class="title"');
    expect(html).toContain("Make Sutaeru feel like yours. Changes apply as you make them.");
  });

  it("keeps every setting that already existed", () => {
    for (const label of [
      "Theme",
      "Background art",
      "Motion",
      "Reduced motion",
      "Art intensity",
      "How Sutaeru talks",
      "Account",
      "Two-factor sign-in",
      "Plan",
      "Models",
      "Purge password",
      "Connections",
    ]) {
      expect(html, `lost ${label}`).toContain(label);
    }
    // and they are still controls, not captions
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('type="range"');
    expect(html).toContain("/connections");
  });

  it("shows three theme picture tiles", () => {
    expect(html).toContain('aria-label="Theme"');
    for (const art of ["theme-light", "theme-dark", "theme-auto"]) {
      expect(html, `no picture for ${art}`).toContain(`/studio/o/${art}.webp`);
    }
    expect((html.match(/class="opt"/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(render("theme-dark")).toContain('data-id="dark"');
    expect(render("theme-dark")).toContain('aria-checked="true" tabindex="0" data-id="dark"');
    // The folded header names the pick, which is the whole point of the fold.
    expect(render("theme-dark")).toContain('data-fold="theme"');
  });

  it("folds every group and opens one at a time on a phone", () => {
    const live = renderLive();
    // Ten sections; with no window in node the phone layout applies, so exactly one is open.
    expect((live.match(/data-fold="/g) ?? []).length).toBe(SETTINGS_FOLD_IDS.length);
    expect((live.match(/data-state="open"/g) ?? []).length).toBe(3); // one section: root, trigger, body
    expect(live).toContain('data-layout="phone"');
    expect(live).toContain("Fold all");
    // The folded header still says what the current pick is.
    expect(live).toContain('data-fold="theme"');
    expect(renderLive("theme-dark")).toContain(">Dark<");
  });

  it("labels the sliders with what they mean, not just a number", () => {
    expect(html).toContain("Concise to detailed");
    expect(html).toContain("Formal to casual");
    expect(html).toContain("Art intensity");
    // The prototype prints the value in the row header rather than as
    // `aria-valuetext`, so a screen reader hears the raw number plus the label.
    expect(render("intensity-min")).toContain(">20%<");
    expect(render("intensity-max")).toContain(">100%<");
  });

  it("prints the meters with the usage the quota query returns", () => {
    expect(html).toContain("Messages today");
    expect(html).toContain("12 / 50");
    expect(render("plan-pro")).toContain("0 / 50");
    expect(render("plan-empty")).toContain("No usage yet.");
  });

  it("names the 2FA controls the container drives", () => {
    const setup = render("2fa-setup");
    expect(setup).toContain("Scan this code with your authenticator app");
    expect(setup).toContain('data-testid="input-2fa-confirm-code"');
    // a six-digit code is what unlocks the confirm button
    expect(render("2fa-verifying")).toContain("Working…");
    expect(render("2fa-rejected")).toContain('role="alert"');
    expect(render("2fa-on")).toContain("On. Sign in needs your password and a 6 digit code.");
    expect(render("2fa-on")).toContain('aria-checked="true"');
  });

  it("distinguishes a card that is loading from one that failed", () => {
    expect(render("all-loading")).toContain("Loading…");
    const error = render("all-error");
    // `renderToStaticMarkup` escapes the apostrophe, so this is the markup's own text.
    expect(error).toContain("Couldn&#x27;t load this right now.");
    expect(error).toContain("Try again");
  });
});

describe("the ported stylesheet", () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, "../../styles/redo/settings.css"),
    "utf8"
  );

  it("keeps interactive targets at the 44px minimum", () => {
    expect(css).toMatch(/\.set-input\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/input\[type="range"\]\s*\{[^}]*height:\s*44px/);
  });

  it("carries the prototype's slider geometry", () => {
    expect(css).toMatch(/--p/); // the filled track
    expect(css).toMatch(/\.settings-folds\s*\{/);
    expect(css).toMatch(/\.settings-view \.head-row,/);
  });
});
