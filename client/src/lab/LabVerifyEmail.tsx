import * as React from "react";
import { useState } from "react";
import { LabLayout } from "./LabLayout";
import { VerifyEmail, type VerifyEmailStatus } from "@/components/redo/VerifyEmail";

interface LabVerifyEmailState {
  id: string;
  label: string;
  status: VerifyEmailStatus;
  message?: string;
}

const STATES: LabVerifyEmailState[] = [
  { id: "pending", label: "Pending", status: "pending" },
  { id: "success", label: "Success", status: "success" },
  { id: "error", label: "Error", status: "error", message: "This link is invalid or has expired." },
];

export default function LabVerifyEmail() {
  const [stateId, setStateId] = useState(STATES[0].id);
  const [width, setWidth] = useState(390);
  const state = STATES.find((s) => s.id === stateId) || STATES[0];

  return (
    <LabLayout title="Verify Email">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--quiet)" }}>
            State:
            <select value={stateId} onChange={(e) => setStateId(e.target.value)} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid var(--stroke)", background: "var(--card)", color: "var(--ink)" }}>
              {STATES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
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
          <div style={{ padding: 24, minHeight: 400 }}>
            <VerifyEmail status={state.status} message={state.message || ""} />
          </div>
        </section>
      </div>
    </LabLayout>
  );
}