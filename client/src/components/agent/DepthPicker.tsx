import * as React from "react";

import { PickTiles } from "@/components/fold";
import { DEPTH_LEVELS, type AgentDepthId } from "@/lib/agentBuilder";
import { pickArt } from "@/lib/pickArt";

export interface DepthPickerProps {
  selected: AgentDepthId;
  onSelect: (id: AgentDepthId) => void;
  disabled?: boolean;
}

const ITEMS = DEPTH_LEVELS.map((d) => ({
  id: d.id,
  label: d.label,
  sub: `${d.src}${d.id === "deep" ? "+" : ""} sources · ${d.min} min`,
  art: pickArt(`depth-${d.id}`),
}));

/** Quick / Standard / Deep as three picture tiles. Only the things that read and write show it. */
export function DepthPicker({ selected, onSelect, disabled }: DepthPickerProps) {
  return (
    <div className="depth-tiles" aria-disabled={disabled || undefined} inert={disabled || undefined}>
      <PickTiles label="How deep" items={ITEMS} value={selected} onChange={(id) => onSelect(id as AgentDepthId)} />
    </div>
  );
}

export default DepthPicker;
