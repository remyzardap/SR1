import * as React from "react";
import { useState } from "react";
import { LabLayout } from "./LabLayout";
import { OfflineBanner } from "@/components/redo/OfflineBanner";

export default function LabOffline() {
  const [width, setWidth] = useState(390);

  return (
    <LabLayout title="Offline Banner">
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
        </div>

        <section style={{ border: "1px dashed var(--stroke)", borderRadius: 16, overflow: "hidden", width, margin: "0 auto" }}>
          <div style={{ padding: 24, minHeight: 200 }}>
            <OfflineBanner />
          </div>
        </section>

        <section style={{ border: "1px dashed var(--stroke)", borderRadius: 16, overflow: "hidden", width, margin: "0 auto" }}>
          <div style={{ padding: 24, minHeight: 200, background: "var(--paper)" }}>
            <OfflineBanner message="You're offline." subMessage="Changes will sync when you're back online." />
          </div>
        </section>
      </div>
    </LabLayout>
  );
}