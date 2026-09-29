import type { SVGProps } from "react";

import { cn } from "@/lib/utils";

type SutaeruGlyphProps = SVGProps<SVGSVGElement> & {
  signal?: boolean;
};

/** Canonical Sutaeru symbol: twin lenses, a torii gate, and the rising sun. */
export function SutaeruGlyph({ className, signal = true, ...props }: SutaeruGlyphProps) {
  return (
    <svg
      viewBox="0 0 144 76"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Sutaeru symbol"
      role="img"
      className={cn("sutaeru-glyph", className)}
      {...props}
    >
      <path
        d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinejoin="round"
      />
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M93 28h30" strokeWidth="5" />
        <path d="M96 32v25M120 32v25" strokeWidth="5" />
        <path d="M91 35h34" strokeWidth="4" />
        <path d="M101 38v19M115 38v19" strokeWidth="3.5" />
      </g>
      {signal ? <circle cx="108" cy="46" r="7" className="sutaeru-glyph-sun" /> : null}
    </svg>
  );
}

export default SutaeruGlyph;