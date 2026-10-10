/**
 * /__lab/settings — the ported Settings screen, shown in every state it can be in.
 *
 * Fixtures only: nothing here logs in, calls the API or writes to localStorage. The
 * handlers SettingsView expects are no-ops, so the controls are visible but inert.
 *
 * `?state=<name>` renders one state alone (the names are the links below); with no
 * `?state=` every state stacks up for a scroll-through. When a single state is shown,
 * that state's Background-art / Art-intensity / Reduce-motion choices are mirrored onto
 * the page so the grain and the motion actually behave — the Theme card stays untouched,
 * because `?theme=` from the Lab header owns the palette.
 *
 * `?folds=open` forces every section open (a closed fold renders no body at all, so the
 * controls would otherwise be invisible); without it the page keeps the real accordion —
 * one open at a time on a phone, remembered per state in localStorage under `lab-*` keys.
 *
 * `?w=360|390|430` is the browser width, not a fake viewport — resize a real window (or
 * DevTools device mode) to check the 360px and the wide layouts.
 */
import { useEffect } from "react";
import { Link, useSearch } from "wouter";

import { SettingsView, SETTINGS_FOLD_IDS } from "@/components/settings/SettingsView";
import { applyArtIntensity, applyBackgroundArt, applyReduceMotion } from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
  SETTINGS_STATE_NAMES,
  SETTINGS_STATES,
  settingsFixture,
  type SettingsState,
} from "./fixtures/settings";
import { LabLayout } from "./LabLayout";

function useSearchParams(): { state: SettingsState | "all"; openAll: boolean } {
  const params = new URLSearchParams(useSearch());
  const param = params.get("state");
  const state: SettingsState | "all" = !param
    ? "all"
    : (SETTINGS_STATE_NAMES as string[]).includes(param)
      ? (param as SettingsState)
      : "default";
  return { state, openAll: params.get("folds") === "open" };
}

export default function LabSettings() {
  const { state, openAll } = useSearchParams();
  const single = state !== "all";

  // Mirror the fixture's own appearance switches onto the document (no storage writes).
  useEffect(() => {
    if (!single) return;
    const fixture = SETTINGS_STATES[state];
    applyBackgroundArt(fixture.backgroundArt);
    applyArtIntensity(fixture.artIntensity);
    applyReduceMotion(fixture.reduceMotion);
  }, [single, state]);

  return (
    <LabLayout title="Settings" bleed>
      <div className="lab-gutter">
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--quiet)" }}>
          Sample data — no login, no network, no saved preferences. Pick a state, or scroll
          through all of them. Theme previews and the sliders below are live; the buttons do
          nothing.
        </p>

        <nav
          aria-label="Settings states"
          style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
        >
          <Link href="/__lab/settings" className={cn("pill", !single && "is-active")}>
            All states
          </Link>
          {SETTINGS_STATE_NAMES.map((name) => (
            <Link
              key={name}
              href={`/__lab/settings?state=${name}`}
              className={cn("pill", state === name && "is-active")}
            >
              {name}
            </Link>
          ))}
          <Link
            href={`/__lab/settings${single ? `?state=${state}&folds=open` : "?folds=open"}`}
            className={cn("pill", openAll && "is-active")}
          >
            folds open
          </Link>
        </nav>

        {single ? (
          <SettingsView {...settingsFixture(state)} foldKey="lab-settings" openSections={openAll ? SETTINGS_FOLD_IDS : undefined} />
        ) : (
          SETTINGS_STATE_NAMES.map((name) => (
            <section key={name}>
              <h2 style={{ font: "700 18px/1 var(--disp)", margin: "0 0 12px" }}>{name}</h2>
              <div
                style={{
                  border: "1px dashed var(--stroke)",
                  borderRadius: 16,
                  overflow: "hidden",
                }}
              >
                <SettingsView
                  {...settingsFixture(name)}
                  foldKey={`lab-settings-${name}`}
                  openSections={openAll ? SETTINGS_FOLD_IDS : undefined}
                />
              </div>
            </section>
          ))
        )}
      </div>
          </div>
    </LabLayout>
  );
}
