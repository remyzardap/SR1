import * as React from "react";

import { FocusBrackets } from "@/components/art/FocusBrackets";
import { cn } from "@/lib/utils";
import { DEPTH_LEVELS, type AgentDepthId } from "@/lib/agentBuilder";

/** The meter shows thirty dots; a depth lights its own count. */
const DOTS = 30;

export interface DepthPickerProps {
  selected: AgentDepthId;
  onSelect: (id: AgentDepthId) => void;
  /** Quick / Standard / Deep only matter to the things that read and write. */
  hidden?: boolean;
  disabled?: boolean;
}

export function DepthPicker({ selected, onSelect, hidden, disabled }: DepthPickerProps) {
  return (
    <div className="field" hidden={hidden}>
      <span className="mono">How deep</span>
      <div className="depths" role="radiogroup" aria-label="How deep">
        {DEPTH_LEVELS.map((d) => (
          <button
            key={d.id}
            type="button"
            className={cn("depth", d.id === selected && "is-on")}
            role="radio"
            aria-checked={d.id === selected}
            disabled={disabled}
            onClick={() => onSelect(d.id)}
          >
            <FocusBrackets className="tight" />
            <b>{d.label}</b>
            <span className="dots-field" aria-hidden="true">
              {Array.from({ length: DOTS }, (_, i) => (
                <i key={i} className={i < d.dots ? "on" : undefined} />
              ))}
            </span>
            <span className="mono">
              {d.src}
              {d.id === "deep" ? "+" : ""} sources · {d.min} min
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default DepthPicker;
