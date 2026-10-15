import * as React from "react";
import { useState } from "react";
import { Link, useSearch } from "wouter";

import { QuietStudioScreen, type QuietComposerShape } from "@/components/studio/QuietStudioScreen";
import { LabLayout } from "./LabLayout";
import { QUIET_STUDIO_STATES, QUIET_STUDIO_STATE_KEYS, type QuietStudioConfig } from "./fixtures/quiet-studio";

export default function LabQuietStudio() {
  const params = new URLSearchParams(useSearch());
  const raw = params.get("state") || "populated";
  const key = QUIET_STUDIO_STATE_KEYS.includes(raw) ? raw : "populated";
  const theme = params.get("theme");
  const widthParam = params.get("w") || "full";
  const cfg: QuietStudioConfig = QUIET_STUDIO_STATES[key];

  const [shape, setShape] = useState<QuietComposerShape>(cfg.composer.shape);
  const [value, setValue] = useState(cfg.composer.value ?? "");

  React.useEffect(() => {
    setShape(cfg.composer.shape);
    setValue(cfg.composer.value ?? "");
  }, [key]);

  const frameWidthStyle =
    widthParam === "360"
      ? { maxWidth: 360, margin: "0 auto", border: "1px solid var(--stroke)", borderRadius: 28, overflow: "hidden", height: 844 }
      : widthParam === "390"
      ? { maxWidth: 390, margin: "0 auto", border: "1px solid var(--stroke)", borderRadius: 28, overflow: "hidden", height: 844 }
      : widthParam === "430"
      ? { maxWidth: 430, margin: "0 auto", border: "1px solid var(--stroke)", borderRadius: 28, overflow: "hidden", height: 844 }
      : widthParam === "1280"
      ? { maxWidth: 1280, margin: "0 auto", height: 600 }
      : { width: "100%", height: 844 };

  return (
    <LabLayout title="Quiet Studio">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "center", marginBottom: 24, padding: 16, background: "var(--card)", borderRadius: 16, border: "1px solid var(--stroke)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span className="mono" style={{ fontSize: 11, marginRight: 4 }}>State:</span>
          {QUIET_STUDIO_STATE_KEYS.map((k) => (
            <Link
              key={k}
              href={`/__lab/quiet-studio?state=${k}${theme ? `&theme=${theme}` : ""}${widthParam !== "full" ? `&w=${widthParam}` : ""}`}
              className={`pill ${key === k ? "on" : ""}`}
              style={{ fontSize: 12, minHeight: 30, padding: "0 10px", textDecoration: "none" }}
              aria-pressed={key === k}
            >
              {k}
            </Link>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span className="mono" style={{ fontSize: 11, marginRight: 4 }}>Width:</span>
          {(["full", "1280", "430", "390", "360"] as const).map((w) => (
            <Link
              key={w}
              href={`/__lab/quiet-studio?state=${key}${theme ? `&theme=${theme}` : ""}${w !== "full" ? `&w=${w}` : ""}`}
              className={`pill ${widthParam === w ? "on" : ""}`}
              style={{ fontSize: 12, minHeight: 30, padding: "0 10px", textDecoration: "none" }}
              aria-pressed={widthParam === w}
            >
              {w === "full" ? "Full" : `${w}px`}
            </Link>
          ))}
        </div>
      </div>
      <div style={frameWidthStyle}>
        <QuietStudioScreen
          images={cfg.images}
          makingImage={cfg.makingImage}
          composer={{
            placeholder: cfg.composer.placeholder,
            shape,
            onShapeChange: setShape,
            onAddFile: () => {},
            onSpeak: () => {},
            onSubmit: () => {},
            value,
            onChange: setValue,
          }}
          onBack={() => {}}
          onImageClick={() => {}}
        />
      </div>
    </LabLayout>
  );
}
