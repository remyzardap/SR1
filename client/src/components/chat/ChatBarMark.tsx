import * as React from "react";
import { cn } from "@/lib/utils";
import { DotRamp } from "@/components/art/DotRamp";
import { SutaeruGlyph } from "@/components/brand/SutaeruGlyph";
import { useChatPhase, type ChatEnergyStore } from "@/lib/motion/chatEnergy";
import type { ChatPhase } from "@/lib/motion/ramp";

export interface ChatBarMarkProps {
  /** Show the logo beside the ramp (off where a logo button already sits next to it). */
  glyph?: boolean;
  /** Force a phase (lab). */
  phase?: ChatPhase;
  store?: ChatEnergyStore;
  reducedMotion?: boolean;
  className?: string;
}

const SPOKEN: Record<ChatPhase, string> = {
  idle: "Ready",
  listening: "Listening",
  thinking: "Thinking",
  streaming: "Writing",
  done: "Ready",
  error: "Stopped",
};

/**
 * The Sutaeru mark for the chat bar: the logo plus the Home hero's dot ramp, alive.
 * A 32 px strip; the ramp follows the chat energy store (see lib/motion/chatEnergy.ts).
 */
export function ChatBarMark({ glyph = true, phase: phaseProp, store, reducedMotion, className }: ChatBarMarkProps) {
  const storePhase = useChatPhase(store);
  const phase = phaseProp ?? storePhase;
  return (
    <span className={cn("chat-bar-mark", className)} data-phase={phase} title={SPOKEN[phase]}>
      {glyph ? <SutaeruGlyph className="chat-bar-mark-glyph" detail="compact" aria-hidden="true" /> : null}
      <DotRamp className="chat-bar-mark-ramp" phase={phaseProp} store={store} reducedMotion={reducedMotion} />
      <span className="sr-only">{SPOKEN[phase]}</span>
    </span>
  );
}

export default ChatBarMark;
