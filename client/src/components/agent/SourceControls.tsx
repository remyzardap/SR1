import * as React from "react";

import { SOURCE_OPTIONS, type AgentSourceId } from "@/lib/agentBuilder";

export interface SourceTogglesProps {
  srcs: Record<AgentSourceId, boolean>;
  onToggle: (id: AgentSourceId) => void;
  disabled?: boolean;
}

/** Where Sutaeru may read from. A press is a yes, not a selection. */
export function SourceToggles({ srcs, onToggle, disabled }: SourceTogglesProps) {
  return (
    <div className="field">
      <span className="mono">Sources</span>
      <div className="src-toggles">
        {SOURCE_OPTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="pill"
            aria-pressed={srcs[s.id]}
            disabled={disabled}
            onClick={() => onToggle(s.id)}
          >
            <span className="letter">{s.letter}</span>
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export interface NotifyRowProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

/** Telegram hand-off: one message with the finished file attached. */
export function NotifyRow({ checked, onChange, disabled }: NotifyRowProps) {
  return (
    <div className="field">
      <div className="toggle-row">
        <div className="tx">
          <b>Tell me on Telegram when it is done</b>
          <small>One message with the file attached</small>
        </div>
        <button
          type="button"
          className="toggle"
          role="switch"
          aria-checked={checked}
          aria-label="Telegram when done"
          disabled={disabled}
          onClick={() => onChange(!checked)}
        />
      </div>
    </div>
  );
}

export default SourceToggles;
