import * as React from "react";
import { useState } from "react";
import { LabLayout } from "./LabLayout";
import { OfflineBanner } from "@/components/redo/OfflineBanner";

export default function LabOffline() {

  return (
    <LabLayout bleed title="Offline Banner">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", padding: "0 24px" }}>
        </div>

        <section style={{ borderTop: "1px dashed var(--stroke)", borderBottom: "1px dashed var(--stroke)", overflow: "hidden" }}>
          <div style={{ minHeight: 200 }}>
            <OfflineBanner />
          </div>
        </section>

        <section style={{ borderTop: "1px dashed var(--stroke)", borderBottom: "1px dashed var(--stroke)", overflow: "hidden" }}>
          <div style={{ minHeight: 200, background: "var(--paper)" }}>
            <OfflineBanner message="You're offline." subMessage="Changes will sync when you're back online." />
          </div>
        </section>
      </div>
    </LabLayout>
  );
}