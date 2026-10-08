import * as React from "react";
import { LabLayout } from "./LabLayout";
import { FirstRun } from "@/components/redo/FirstRun";

export default function LabFirstRun() {

  return (
    <LabLayout bleed title="First Run — Welcome Screen">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", padding: "0 24px" }}>
        </div>

        <section style={{ borderTop: "1px dashed var(--stroke)", borderBottom: "1px dashed var(--stroke)", overflow: "hidden" }}>
          <div style={{ minHeight: 400 }}>
            <FirstRun onDismiss={() => {}} />
          </div>
        </section>
      </div>
    </LabLayout>
  );
}

function useState<T>(initial: T): [T, (v: T) => void] {
  const [state, setState] = React.useState(initial);
  return [state, setState];
}