import type { CSSProperties } from "react";
import { SutaeruIcon, type SutaeruIconName } from "./SutaeruIcon";

// Drop-in replacements for generic "AI" icons (sparkle, wand, brain, robot),
// which the Sutaeru icon rules forbid. Same props shape as lucide icons.
type Props = { className?: string; style?: CSSProperties; strokeWidth?: number; size?: number };

const make = (name: SutaeruIconName) =>
  function BrandIcon({ className, style, size }: Props) {
    return <SutaeruIcon name={name} className={className} style={size ? { width: size, height: size, ...style } : style} />;
  };

export const Sparkles = make("make");
export const Wand2 = make("make");
export const Brain = make("memory");
export const Bot = make("agent");
