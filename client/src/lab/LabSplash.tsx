import * as React from "react";
import { useState } from "react";
import { LabLayout } from "./LabLayout";
import { BrandIntro } from "@/components/redo/BrandIntro";

export default function LabSplash() {
  const [width, setWidth] = useState(390);
  const [forceIntro, setForceIntro] = useState(false);
  const [key, setKey] = useState(0);

  const replay = () => {
    setForceIntro(true);
    setKey((k) => k + 1);
  };

  return (
    <LabLayout title="Splash / Brand Intro">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--quiet)" }}>
            Width:
            <select value={width} onChange={(e) => setWidth(Number(e.target.value))} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid var(--stroke)", background: "var(--card)", color: "var(--ink)" }}>
              <option value={360}>360px</option>
              <option value={390}>390px</option>
              <option value={1280}>1280px</option>
            </select>
          </label>
          <button className="btn" onClick={replay}>Replay Intro</button>
        </div>

        <section style={{ border: "1px dashed var(--stroke)", borderRadius: 16, overflow: "hidden", width, margin: "0 auto" }}>
          <div style={{ padding: 24, minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BrandIntro key={key} forceIntro={forceIntro} />
          </div>
        </section>
      </div>
    </LabLayout>
  );
}