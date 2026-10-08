import * as React from "react";
import { useState } from "react";
import { LabLayout } from "./LabLayout";
import { Landing } from "@/components/redo/Landing";

export default function LabLanding() {

  return (
    <LabLayout bleed title="Landing — Public Landing Page">
      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", padding: "0 24px" }}>
        </div>

        <section style={{ borderTop: "1px dashed var(--stroke)", borderBottom: "1px dashed var(--stroke)", overflow: "hidden" }}>
          <div style={{ minHeight: 600 }}>
            <Landing />
          </div>
        </section>
      </div>
    </LabLayout>
  );
}