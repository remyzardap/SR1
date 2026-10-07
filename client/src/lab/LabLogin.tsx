import * as React from "react";
import { useState } from "react";
import { LabLayout } from "./LabLayout";
import { Login, type LoginTab, type LoginStep } from "@/components/redo/Login";

interface LabLoginState {
  id: string;
  label: string;
  tab: LoginTab;
  step: LoginStep;
  codeError?: string;
  loginError?: string;
  registerError?: string;
  registerSuccess?: boolean;
}

const STATES: LabLoginState[] = [
  { id: "signin", label: "Sign In", tab: "in", step: "credentials" },
  { id: "signup", label: "Sign Up", tab: "up", step: "credentials" },
  { id: "2fa", label: "2FA Code", tab: "in", step: "code" },
  { id: "signin-error", label: "Sign In (Error)", tab: "in", step: "credentials", loginError: "Invalid credentials" },
  { id: "signup-error", label: "Sign Up (Error)", tab: "up", step: "credentials", registerError: "Email already in use" },
  { id: "2fa-error", label: "2FA (Error)", tab: "in", step: "code", codeError: "That code did not work. Please try again." },
  { id: "register-success", label: "Register Success", tab: "in", step: "credentials", registerSuccess: true },
];

export default function LabLogin() {
  const [stateId, setStateId] = useState(STATES[0].id);
  const [width, setWidth] = useState(390);
  const state = STATES.find((s) => s.id === stateId) || STATES[0];

  return (
    <LabLayout title="Login — Sign In / Sign Up / 2FA">
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
          <div style={{ padding: 24, minHeight: 500 }}>
            <Login
              tab={state.tab}
              step={state.step}
              code="123456"
              codeError={state.codeError || ""}
              loginError={state.loginError || ""}
              registerError={state.registerError || ""}
              registerSuccess={state.registerSuccess || false}
              pending={false}
              codePending={false}
              onTabChange={() => {}}
              onLogin={() => {}}
              onRegister={() => {}}
              onCodeSubmit={() => {}}
              onCodeChange={() => {}}
              onBackToCredentials={() => {}}
              onForgotPassword={() => {}}
            />
          </div>
        </section>
      </div>
    </LabLayout>
  );
}