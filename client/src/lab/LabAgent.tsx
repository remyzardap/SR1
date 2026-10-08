import * as React from "react";
import { useState } from "react";
import { Link, useSearch } from "wouter";

import { AgentBuilder } from "@/components/agent/AgentBuilder";
import { AgentScreen } from "@/components/agent/AgentScreen";
import { cn } from "@/lib/utils";
import { planFor } from "@/lib/agentBuilder";
import { LabLayout } from "./LabLayout";
import { AGENT_LAB_DEFAULT, AGENT_LAB_STATES, type AgentLabState } from "./fixtures/agent";

const noop = () => {};

/**
 * The task builder, one route per state the reviewer has to check.
 * ?state=report|deck|sheet|image|brief|monitor|deep|no-sources|redraw|validation|credits|submitting|live
 */
export default function LabAgent() {
  const params = new URLSearchParams(useSearch());
  const requested = params.get("state") ?? AGENT_LAB_DEFAULT;
  const theme = params.get("theme");
  const [sent, setSent] = useState<string[]>([]);

  const href = (id: string) => {
    const query = new URLSearchParams({ state: id });
    if (theme) query.set("theme", theme);
    return `/__lab/agent?${query.toString()}`;
  };

  const fixture = AGENT_LAB_STATES.find((s) => s.id === requested);
  const shown: AgentLabState = fixture ?? AGENT_LAB_STATES[0];
  const live = requested === "live";

  return (
    <LabLayout title="Agent — task builder">
      <nav aria-label="Screen state" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {AGENT_LAB_STATES.map((s) => (
          <Link
            key={s.id}
            href={href(s.id)}
            className={cn("pill", requested === s.id && "is-on")}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              fontSize: 13,
              textDecoration: "none",
              background: requested === s.id ? "var(--ink)" : "var(--card)",
              color: requested === s.id ? "var(--paper)" : "var(--ink)",
              border: "1px solid var(--stroke)",
            }}
          >
            {s.label}
          </Link>
        ))}
        <Link
          href={href("live")}
          className={cn("pill", live && "is-on")}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            fontSize: 13,
            textDecoration: "none",
            background: live ? "var(--ink)" : "var(--card)",
            color: live ? "var(--paper)" : "var(--ink)",
            border: "1px dashed var(--stroke)",
          }}
        >
          Live (click it)
        </Link>
      </nav>

      {live ? (
        <AgentBuilder
          onCreateTask={(text) => setSent((prev) => [text, ...prev].slice(0, 3))}
          onOpenStudio={() => setSent((prev) => ["→ would open /images with the brief kept in the draft", ...prev].slice(0, 3))}
          onOpenSession={() => {}}
          isStreaming={false}
          error={null}
        />
      ) : (
        <AgentScreen
          agent={shown.agent}
          plan={planFor(shown.agent.out, shown.agent.depth)}
          status={shown.status}
          notice={shown.notice}
          redrawing={shown.redrawing}
          onSelectOutput={noop}
          onBrief={noop}
          onSelectDepth={noop}
          onToggleSource={noop}
          onNotify={noop}
          onStart={noop}
        />
      )}

      <p style={{ marginTop: 20, color: "var(--quiet)", fontSize: 14, maxWidth: "44em" }}>
        {live
          ? "Interactive: the draft is held in this component and in sessionStorage, like the prototype's in-memory state."
          : shown.note}
      </p>

      {sent.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary className="mono">What Start sends to the chat</summary>
          {sent.map((text, i) => (
            <pre key={i} style={{ whiteSpace: "pre-wrap", marginTop: 12, color: "var(--quiet)", fontSize: 13 }}>
              {text}
            </pre>
          ))}
        </details>
      )}
    </LabLayout>
  );
}
