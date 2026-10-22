import * as React from "react";
import { Link, useSearch } from "wouter";
import { HomeScreen, DEFAULT_HOME_MODES } from "@/components/home/HomeScreen";
import { cn } from "@/lib/utils";
import { LabLayout } from "./LabLayout";
import {
  HOME_LAB_STATES,
  LAB_HOME_SOURCES,
  LAB_HOME_WIDTHS,
  homeLabComposer,
  type HomeLabState,
} from "./fixtures/home";

const noop = () => {};

export default function LabHome() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const requested = params.get("state") as HomeLabState | null;
  const state: HomeLabState = requested && HOME_LAB_STATES.includes(requested) ? requested : "default";

  const widthParam = params.get("width");
  const width =
    widthParam === "360" ? 360 : widthParam === "390" ? 390 : widthParam === "1280" ? 1280 : "full";

  const makeUrl = (updates: Record<string, string | null>) => {
    const p = new URLSearchParams(search);
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    const q = p.toString();
    return `/__lab/home${q ? `?${q}` : ""}`;
  };

  const comp = homeLabComposer(state);
  const activeModeIndex =
    state === "deep" ? 3 : state === "image" ? 2 : state === "recording" ? 1 : 0;

  return (
    <LabLayout title={`Home · ${state} (${width === "full" ? "responsive" : `${width}px`})`} bleed={width === "full"}>
      {/* State & Width controls bar */}
      <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* State pills */}
        <nav aria-label="Home states" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {HOME_LAB_STATES.map((name) => (
            <Link
              key={name}
              href={makeUrl({ state: name })}
              className={cn("pill", name === state && "on")}
              style={{ textDecoration: "none" }}
            >
              {name}
            </Link>
          ))}
        </nav>

        {/* Width switcher (360 / 390 / 1280 / full) */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="qmono" style={{ fontSize: 10, color: "var(--quiet)" }}>Width:</span>
          {(["full", ...LAB_HOME_WIDTHS] as const).map((w) => {
            const isSelected = (w === "full" && width === "full") || width === w;
            return (
              <Link
                key={String(w)}
                href={makeUrl({ width: w === "full" ? null : String(w) })}
                className={cn("pill", isSelected && "on")}
                style={{ textDecoration: "none", fontSize: 11, padding: "4px 10px" }}
              >
                {w === "full" ? "Full width" : `${w}px`}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Frame container */}
      <div
        style={
          width !== "full"
            ? {
                width,
                maxWidth: "100%",
                margin: "0 auto 40px",
                border: "1px solid var(--stroke)",
                borderRadius: width > 760 ? 16 : 32,
                overflow: "hidden",
                boxShadow: "0 20px 48px -18px rgba(0, 0, 0, 0.45)",
                background: "var(--bg)",
                minHeight: 780,
              }
            : undefined
        }
      >
        <HomeScreen
          modes={DEFAULT_HOME_MODES}
          activeModeIndex={activeModeIndex}
          listening={state === "recording"}
          composer={{
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
          }}
        />
      </div>
    </LabLayout>
  );
}
