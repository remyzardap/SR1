import * as React from "react";
import { useState } from "react";
import { LabLayout } from "./LabLayout";
import { BrandIntro } from "@/components/redo/BrandIntro";

export default function LabSplash() {
  const [forceIntro, setForceIntro] = useState(false);
  const [key, setKey] = useState(0);

  const replay = () => {
    setForceIntro(true);
    setKey((k) => k + 1);
  };

  return (
    <LabLayout bleed title="Splash / Brand Intro">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", padding: "0 24px" }}>
          <button className="btn" onClick={replay}>Replay Intro</button>
        </div>

        <section style={{ borderTop: "1px dashed var(--stroke)", borderBottom: "1px dashed var(--stroke)", overflow: "hidden" }}>
          <div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BrandIntro key={key} forceIntro={forceIntro} />
          </div>
        </section>
      </div>
    </LabLayout>
  );
}