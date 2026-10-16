import { useState } from "react";
import { Link, useSearch } from "wouter";
import { LabLayout } from "./LabLayout";
import { VoiceScreen } from "@/components/voice/VoiceScreen";
import { VOICE_LAB_FIXTURES, VOICE_STATE_NAMES, type VoiceLabState } from "./fixtures/voice";
import { cn } from "@/lib/utils";

function useSearchParams(): { state: VoiceLabState | "all" } {
  const params = new URLSearchParams(useSearch());
  const param = params.get("state");
  const state: VoiceLabState | "all" = !param
    ? "all"
    : (VOICE_STATE_NAMES as string[]).includes(param)
      ? (param as VoiceLabState)
      : "idle";
  return { state };
}

export default function LabVoice() {
  const { state } = useSearchParams();
  const single = state !== "all";
  const [currentState, setCurrentState] = useState<VoiceLabState>("idle");

  const activeState = single ? state : currentState;
  const fixture = VOICE_LAB_FIXTURES[activeState];

  return (
    <LabLayout title="Voice Screen">
      <div className="lab-gutter">
        <p className="mono" style={{ margin: "0 0 16px", fontSize: 12, color: "var(--quiet)" }}>
          Sample data — no microphone, no network. Click a state below, or the buttons in the component do nothing.
        </p>

        <nav aria-label="Voice states" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
          <Link href="/__lab/voice" className={cn("pill", !single && "is-active")}>
            All states
          </Link>
          {VOICE_STATE_NAMES.map((name) => (
            <Link
              key={name}
              href={`/__lab/voice?state=${name}`}
              className={cn("pill", state === name && "is-active")}
            >
              {name}
            </Link>
          ))}
        </nav>

        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          {!single && (
            <div style={{ display: "flex", gap: 8 }}>
              {VOICE_STATE_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={cn("pill", currentState === name && "is-active")}
                  onClick={() => setCurrentState(name)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    border: "1px solid var(--stroke)",
                    background: currentState === name ? "var(--ink)" : "var(--card)",
                    color: currentState === name ? "var(--paper)" : "var(--ink)",
                    cursor: "pointer",
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ maxWidth: 390, margin: "0 auto", border: "1px solid var(--stroke)", borderRadius: 28, overflow: "hidden" }}>
          <VoiceScreen {...fixture} />
        </div>
      </div>
    </LabLayout>
  );
}
