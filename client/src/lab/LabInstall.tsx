import * as React from "react";
import { useState } from "react";
import { LabLayout } from "./LabLayout";
import { InstallPrompt, type InstallState } from "@/components/redo/InstallPrompt";

interface LabInstallState {
  id: string;
  label: string;
  state: InstallState;
}

const STATES: LabInstallState[] = [
  { id: "prompt", label: "Install Prompt", state: "prompt" },
  { id: "ios", label: "iOS Guide", state: "ios" },
  { id: "installed", label: "Installed (Hidden)", state: "installed" },
  { id: "dismissed", label: "Dismissed (Hidden)", state: "dismissed" },
];

export default function LabInstall() {
  const [stateId, setStateId] = useState(STATES[0].id);
  const state = STATES.find((s) => s.id === stateId) || STATES[0];

  return (
    <LabLayout bleed title="Install Prompt & iOS Guide">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", padding: "0 24px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--quiet)" }}>
            State:
            <select value={stateId} onChange={(e) => setStateId(e.target.value)} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid var(--stroke)", background: "var(--card)", color: "var(--ink)" }}>
              {STATES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>

        <section style={{ borderTop: "1px dashed var(--stroke)", borderBottom: "1px dashed var(--stroke)", overflow: "hidden" }}>
          <div style={{ minHeight: 200 }}>
            <InstallPrompt
              state={state.state}
              onInstall={() => {}}
              onDismiss={() => {}}
              onIosGuide={() => {}}
              onIosDismiss={() => {}}
            />
          </div>
        </section>
      </div>
    </LabLayout>
  );
}