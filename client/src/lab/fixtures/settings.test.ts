import { describe, it, expect } from "vitest";
import * as React from "react";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { SETTINGS_FOLD_IDS, SettingsView } from "@/components/settings/SettingsView";
import { SETTINGS_STATE_NAMES, SETTINGS_STATES, settingsFixture } from "./settings";

/**
 * The lab's contract with itself: every named state must render from fixtures alone —
 * no login, no network, no styles we never wrote. These run in plain node, so they are
 * the closest thing to a screenshot we can automate.
 */

function renderState(name: (typeof SETTINGS_STATE_NAMES)[number]): string {
  return renderToStaticMarkup(
    React.createElement(
      Router,
      { ssrPath: "/settings" },
      React.createElement(SettingsView, { ...settingsFixture(name), openSections: SETTINGS_FOLD_IDS })
    )
  );
}

describe("settings lab fixtures", () => {
  it("renders every state without throwing", () => {
    for (const name of SETTINGS_STATE_NAMES) {
      const html = renderState(name);
      expect(html, `${name} rendered nothing`).toContain("settings-view");
      expect(html, `${name} lost the page title`).toContain("Settings");
    }
  });

  it("covers what the redo spec asks the lab to show", () => {
    // Each theme, the switches off, and both slider extremes.
    for (const name of [
      "theme-light",
      "theme-dark",
      "art-off",
      "motion-reduced",
      "intensity-min",
      "intensity-max",
      "voice-min",
      "voice-max",
    ]) {
      expect(SETTINGS_STATE_NAMES, `missing lab state ${name}`).toContain(name);
    }
    expect(SETTINGS_STATES["intensity-min"].artIntensity).toBe(20);
    expect(SETTINGS_STATES["intensity-max"].artIntensity).toBe(100);
    expect(SETTINGS_STATES["voice-min"].voice).toEqual({ detail: 0, tone: 0 });
    expect(SETTINGS_STATES["voice-max"].voice).toEqual({ detail: 100, tone: 100 });
  });

  it("keeps the data-heavy cards reachable in every status", () => {
    const loading = renderState("all-loading");
    expect(loading).toContain("set-skeleton");
    const error = renderState("all-error");
    expect(error).toContain("Try again");
    expect(SETTINGS_STATE_NAMES.filter((name) => name.startsWith("2fa-"))).toHaveLength(5);
  });

  it("never touches storage or the network from a handler", () => {
    const props = settingsFixture("default");
    expect(() => {
      props.onThemeChange("dark");
      props.onBackgroundArtChange(false);
      props.onReduceMotionChange(true);
      props.onArtIntensityChange(50);
      props.onVoiceChange({ detail: 1, tone: 2 });
      props.onAccountRetry();
      props.onTwoFactorToggle();
      props.onTwoFactorTokenChange("123456");
      props.onTwoFactorSubmit();
      props.onTwoFactorCancel();
      props.onTwoFactorCopyKey();
      props.onTwoFactorRetry();
      props.onPlanRetry();
      props.onStartTrial();
      props.onModelsRetry();
      props.onPurgePasswordChange("x");
      props.onPurgeSave();
      props.onPurgeRetry();
    }).not.toThrow();
  });

  it("only uses class names the stylesheets define", () => {
    const clientSrc = path.resolve(__dirname, "../..");
    const cssFiles: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".css")) cssFiles.push(full);
      }
    };
    walk(clientSrc);
    expect(cssFiles.length).toBeGreaterThan(10);

    const defined = new Set<string>();
    for (const file of cssFiles) {
      for (const match of fs.readFileSync(file, "utf8").matchAll(/\.([a-z_][\w-]*)/gi)) {
        defined.add(match[1]);
      }
    }

    const used = new Set<string>();
    for (const name of SETTINGS_STATE_NAMES) {
      for (const match of renderState(name).matchAll(/class="([^"]+)"/g)) {
        for (const cls of match[1].split(/\s+/)) if (cls) used.add(cls);
      }
    }

    const missing = [...used].filter((cls) => !defined.has(cls)).sort();
    expect(missing, "SettingsView marks up classes no stylesheet styles").toEqual([]);
  });
});
