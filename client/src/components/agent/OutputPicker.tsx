import * as React from "react";

import { DocMini } from "@/components/DocMini";
import { FocusBrackets } from "@/components/art/FocusBrackets";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { StudioFrame } from "@/components/studio/StudioFrame";
import { cn } from "@/lib/utils";
import { DEFAULT_SHOT } from "@/lib/studio";
import { OUTPUT_TYPES, type AgentOutputId } from "@/lib/agentBuilder";

export interface OutputPickerProps {
  selected: AgentOutputId;
  onSelect: (id: AgentOutputId) => void;
  disabled?: boolean;
}

/** The six things you can ask for, each with its own drawn preview. */
export function OutputPicker({ selected, onSelect, disabled }: OutputPickerProps) {
  return (
    <div className="outputs" role="radiogroup" aria-label="What to make">
      {OUTPUT_TYPES.map((o) => (
        <button
          key={o.id}
          type="button"
          className={cn("out", o.id === selected && "is-on")}
          role="radio"
          aria-checked={o.id === selected}
          disabled={disabled}
          onClick={() => onSelect(o.id)}
        >
          {/* Brackets mark the chosen card only (FocusBrackets draws when mounted). */}
          {o.id === selected ? <FocusBrackets /> : null}
          <span className="prev">
            {o.id === "image" ? (
              <StudioFrame shot={DEFAULT_SHOT} width={200} aspect={1.9} />
            ) : (
              <DocMini kind={o.id} />
            )}
          </span>
          <span className="nm">
            <b>{o.name}</b>
            <small>{o.blurb}</small>
          </span>
          <span className="check-badge">
            <SutaeruIcon name="check" signal={false} className="ico" />
          </span>
        </button>
      ))}
    </div>
  );
}

export default OutputPicker;
