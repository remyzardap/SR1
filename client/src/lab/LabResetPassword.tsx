import * as React from "react";
import { useState } from "react";
import { LabLayout } from "./LabLayout";
import { ResetPassword } from "@/components/redo/ResetPassword";

interface LabResetPasswordState {
  id: string;
  label: string;
  success: boolean;
  error: string | null;
  token: string | null;
  loading: boolean;
}

const STATES: LabResetPasswordState[] = [
  { id: "form", label: "Form", success: false, error: null, token: "valid-token", loading: false },
  { id: "form-error", label: "Form (Error)", success: false, error: "Token expired", token: "valid-token", loading: false },
  { id: "no-token", label: "No Token", success: false, error: null, token: null, loading: false },
  { id: "success", label: "Success", success: true, error: null, token: "valid-token", loading: false },
  { id: "loading", label: "Loading", success: false, error: null, token: "valid-token", loading: true },
];

export default function LabResetPassword() {
  const [stateId, setStateId] = useState(STATES[0].id);
  const [width, setWidth] = useState(390);
  const state = STATES.find((s) => s.id === stateId) || STATES[0];

  return (
    <LabLayout title="Reset Password">
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
            <ResetPassword
              token={state.token}
              success={state.success}
              error={state.error}
              isPending={state.loading}
              formData={{ password: "", confirmPassword: "" }}
              formErrors={{}}
              onSubmit={() => {}}
              onChange={() => {}}
            />
          </div>
        </section>
      </div>
    </LabLayout>
  );
}