import * as React from "react";
import { LabLayout } from "./LabLayout";
import { CodeThreadView, type CodeThreadApi } from "@/components/CodeThread";
import { ConvergeBar, FocusBrackets } from "@/components/art";
import "@/styles/video.css";
import "@/styles/code-sessions.css";
import "@/styles/attach.css";

/** Loading, empty and error states for Documents, Video, Code sessions and the Drive dialog (static fixtures). */

const noop = async () => undefined;
const base: CodeThreadApi = {
  active: true, session: null, events: [], running: false, needsApproval: false, gate: null, busy: false,
  fullAvailable: false, send: async () => true, stop: noop, decide: noop,
};
const session = { id: "c1", title: "Deploy", status: "done" as const, mode: "edit" as const, spent_usd: 0.42, updated: 0, pending_approvals: [] };
const events: CodeThreadApi["events"] = [
  { n: 0, type: "sutaeru", kind: "user", text: "Why is the deploy slow?" },
  { n: 1, type: "claude", event: { type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/root/sr1/Dockerfile" } }] } } },
  { n: 2, type: "claude", event: { type: "assistant", message: { content: [{ type: "text", text: "The lockfile is copied after the source, so every deploy reinstalls." }] } } },
];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ margin: "0 0 32px" }}>
      <h2 style={{ font: "500 11px/1.4 var(--mono)", letterSpacing: "1.54px", textTransform: "uppercase", color: "var(--quiet)", margin: "0 0 12px" }}>{title}</h2>
      {children}
    </section>
  );
}

export default function LabDocsStates() {
  return (
    <LabLayout title="Documents, Video and Code states">
      <div style={{ maxWidth: 640 }}>
        <Block title="Video engines: loading">
          <div className="vd-note" role="status">Loading video engines...</div>
        </Block>
        <Block title="Video engines: error">
          <div className="vd-note">
            <p>Engines are unreachable.</p>
            <button type="button" className="vd-btn vd-btn-ghost">Try again</button>
          </div>
        </Block>
        <Block title="Video engines: none set up">
          <div className="vd-note">No video engine is set up on this server yet. Ask the owner to add one.</div>
        </Block>
        <Block title="Video: filming and stopped">
          <div className="vd-card" style={{ marginBottom: 12 }}><ConvergeBar progress={0.42} etaSeconds={38} label="DRAWING" /></div>
          <div className="vd-card"><ConvergeBar progress={0.3} state="error" label="STOPPED" etaOverride="TOOK 12 S" /></div>
        </Block>
        <Block title="Selected card marks (FocusBrackets)">
          <div style={{ position: "relative", margin: 10 }}>
            <div className="vd-engine is-active" style={{ margin: 0 }}><span className="vd-engine-name">Gemini</span></div>
            <FocusBrackets />
          </div>
        </Block>
        <Block title="Drive dialog: checking">
          <div className="sk-empty" style={{ padding: 0 }}>
            <span className="sk-label">Google Drive</span>
            <div className="sk-col" style={{ gap: 10, display: "flex", flexDirection: "column" }}>
              <div className="sk-skeleton" style={{ height: 14, width: "40%" }} />
              <div className="sk-skeleton" style={{ height: 44, width: "100%" }} />
              <div className="sk-skeleton" style={{ height: 44, width: "100%" }} />
            </div>
            <p className="sk-empty-text" role="status">Checking your Google connection...</p>
          </div>
        </Block>
        <Block title="Code mode: empty">
          <div style={{ border: "1px solid var(--stroke)", borderRadius: 24 }}><CodeThreadView code={base} /></div>
        </Block>
        <Block title="Code mode: locked (error)">
          <div style={{ border: "1px solid var(--stroke)", borderRadius: 24 }}>
            <CodeThreadView code={{ ...base, gate: Object.assign(new Error("Code mode needs the two-factor code set up first."), { reason: "totp" }) as CodeThreadApi["gate"] }} />
          </div>
        </Block>
        <Block title="Code mode: populated, waiting for approval">
          <div style={{ border: "1px solid var(--stroke)", borderRadius: 24 }}>
            <CodeThreadView code={{ ...base, session: { ...session, status: "needs_approval", pending_approvals: [{ id: "a", tool: "Bash", input: { command: "npm ci && npm run build" } }] }, events, needsApproval: true }} />
          </div>
        </Block>
      </div>
    </LabLayout>
  );
}
