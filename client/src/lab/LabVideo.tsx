import * as React from "react";
import { Link, useSearch, useLocation } from "wouter";
import { VideoScreen } from "@/components/video";
import { VIDEO_LAB_STATES, type VideoLabState } from "./fixtures/video";
import { LabLayout } from "./LabLayout";

export default function LabVideo() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(search);

  const rawState = params.get("state") || "prompt_default";
  const stateKey = rawState in VIDEO_LAB_STATES ? (rawState as VideoLabState) : "prompt_default";
  const currentConfig = VIDEO_LAB_STATES[stateKey];

  const widthParam = params.get("w") || "full";

  const updateStateParam = (newKey: string) => {
    const nextParams = new URLSearchParams(search);
    nextParams.set("state", newKey);
    setLocation(`/__lab/video?${nextParams.toString()}`);
  };

  const updateWidthParam = (newWidth: string) => {
    const nextParams = new URLSearchParams(search);
    if (newWidth === "full") nextParams.delete("w");
    else nextParams.set("w", newWidth);
    setLocation(`/__lab/video?${nextParams.toString()}`);
  };

  const frameWidthStyle =
    widthParam === "360"
      ? { maxWidth: 360, margin: "0 auto", border: "1px solid var(--stroke)", borderRadius: 28, overflow: "hidden" }
      : widthParam === "390"
      ? { maxWidth: 390, margin: "0 auto", border: "1px solid var(--stroke)", borderRadius: 28, overflow: "hidden" }
      : widthParam === "430"
      ? { maxWidth: 430, margin: "0 auto", border: "1px solid var(--stroke)", borderRadius: 28, overflow: "hidden" }
      : widthParam === "1280"
      ? { maxWidth: 1280, margin: "0 auto" }
      : { width: "100%" };

  return (
    <LabLayout title="Video Screen">
      {/* State & Width Pickers */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
          padding: 16,
          background: "var(--card)",
          borderRadius: 16,
          border: "1px solid var(--stroke)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span className="mono" style={{ fontSize: 11, marginRight: 4 }}>
            State:
          </span>
          {Object.entries(VIDEO_LAB_STATES).map(([key, cfg]) => (
            <Link
              key={key}
              href={`/__lab/video?state=${key}&w=${widthParam}`}
              className={`pill ${stateKey === key ? "on" : ""}`}
              style={{ fontSize: 12, minHeight: 30, padding: "0 10px" }}
              aria-pressed={stateKey === key}
            >
              {cfg.label}
            </Link>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span className="mono" style={{ fontSize: 11, marginRight: 4 }}>
            Width:
          </span>
          {(["full", "1280", "430", "390", "360"] as const).map((w) => (
            <Link
              key={w}
              href={`/__lab/video?state=${stateKey}&w=${w === "full" ? "" : w}`}
              className={`pill ${widthParam === w ? "on" : ""}`}
              style={{ fontSize: 12, minHeight: 30, padding: "0 10px" }}
              aria-pressed={widthParam === w}
            >
              {w === "full" ? "Full" : `${w}px`}
            </Link>
          ))}
        </div>
      </div>

      {/* Frame Container */}
      <div style={frameWidthStyle}>
        <VideoScreen {...currentConfig.props} />
      </div>
    </LabLayout>
  );
}