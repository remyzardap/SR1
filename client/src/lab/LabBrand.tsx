import * as React from "react";
import { useState } from "react";
import { LabLayout } from "./LabLayout";
import { SutaeruGlyph, SutaeruSeal, SutaeruStamp, BrandIntro } from "@/components/brand";

export default function LabBrand() {
  const [introKey, setIntroKey] = useState(0);

  return (
    <LabLayout title="Brand — Glyph, Seal, Stamp, Intro">
      <div style={{ display: "grid", gap: 32 }}>
        <section className="card" style={{ padding: 24, borderRadius: 20 }}>
          <h2 style={{ font: "700 18px/1 var(--disp)", marginBottom: 16 }}>SutaeruGlyph</h2>
          <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 8, color: "var(--quiet)" }}>Full detail (144x76)</span>
              <SutaeruGlyph detail="full" size={144} />
            </div>
            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 8, color: "var(--quiet)" }}>Compact detail (96x50)</span>
              <SutaeruGlyph detail="compact" size={96} />
            </div>
            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 8, color: "var(--quiet)" }}>Icon size (44x23)</span>
              <SutaeruGlyph detail="compact" size={44} />
            </div>
          </div>
        </section>

        <section className="card" style={{ padding: 24, borderRadius: 20 }}>
          <h2 style={{ font: "700 18px/1 var(--disp)", marginBottom: 16 }}>Seals & Stamps</h2>
          <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 8, color: "var(--quiet)" }}>Rakkan Name Seal (スタエル)</span>
              <SutaeruSeal size={48} />
            </div>
            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 8, color: "var(--quiet)" }}>Settled Stamp (済)</span>
              <SutaeruStamp size={48} />
            </div>
          </div>
        </section>

        <section className="card" style={{ padding: 24, borderRadius: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ font: "700 18px/1 var(--disp)", margin: 0 }}>BrandIntro Animation</h2>
            <button
              type="button"
              className="btn ink"
              onClick={() => setIntroKey((k) => k + 1)}
            >
              Replay Intro
            </button>
          </div>
          <div style={{ border: "1px dashed var(--stroke)", borderRadius: 16, padding: "20px 0" }}>
            <BrandIntro key={introKey} forceIntro={true} />
          </div>
        </section>
      </div>
    </LabLayout>
  );
}
