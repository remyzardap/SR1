import * as React from "react";
import { useId, type SVGProps } from "react";
import { cn } from "@/lib/utils";
import { KANA, type Kana } from "./kana";

export type MarkProps = SVGProps<SVGSVGElement> & {
  /** Slightly uneven ink edge, as if pressed by hand. Off for very small sizes. */
  rough?: boolean;
  size?: number;
  variant?: "name" | "settled";
};

const uid = (raw: string) => raw.replace(/[^a-zA-Z0-9]/g, "");

/**
 * Name seal (rakkan). It reads スタエル in Shippori Mincho, set right column first as a
 * name seal is read, with the characters cut out of a vermilion square.
 * Sits beside the wordmark and in the navigation.
 *
 * If variant="settled" is provided, renders the SutaeruStamp (済 settled stamp).
 */
export function SutaeruSeal({
  className,
  rough = true,
  size,
  variant = "name",
  width,
  height,
  ...props
}: MarkProps) {
  if (variant === "settled") {
    return (
      <SutaeruStamp
        className={className}
        rough={rough}
        size={size}
        width={width}
        height={height}
        {...props}
      />
    );
  }

  const id = `ss${uid(useId())}`;
  const cell = (ch: Kana, x: number, y: number) => (
    <path d={KANA[ch]} transform={`translate(${x} ${y}) scale(0.0392)`} />
  );

  const resolvedWidth = size ?? width;
  const resolvedHeight = size ?? height;

  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label="スタエル"
      width={resolvedWidth}
      height={resolvedHeight}
      className={cn("seal sutaeru-seal", className)}
      {...props}
    >
      <defs>
        {rough ? (
          <filter id={`${id}f`} x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves={2} seed={4} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={2.2} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        ) : null}
        <mask id={`${id}m`}>
          <rect width="100" height="100" fill="#fff" />
          <g fill="#000">
            {cell("ス", 52, 7)}
            {cell("タ", 52, 51)}
            {cell("エ", 8, 7)}
            {cell("ル", 8, 51)}
          </g>
        </mask>
      </defs>
      <g filter={rough ? `url(#${id}f)` : undefined}>
        <rect
          x="2"
          y="2"
          width="96"
          height="96"
          rx="9"
          className="seal-ink sutaeru-seal-ink"
          fill="var(--accent, #F4511E)"
          mask={`url(#${id}m)`}
        />
      </g>
    </svg>
  );
}

/**
 * Settled stamp: 済 inside a double ring. Pressed onto finished work only
 * (a finished image, a finished session), never as decoration.
 */
export function SutaeruStamp({
  className,
  rough = true,
  size,
  width,
  height,
  ...props
}: MarkProps) {
  const id = `st${uid(useId())}`;
  const resolvedWidth = size ?? width;
  const resolvedHeight = size ?? height;

  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label="Done"
      width={resolvedWidth}
      height={resolvedHeight}
      className={cn("stamp sutaeru-stamp", className)}
      {...props}
    >
      {rough ? (
        <defs>
          <filter id={`${id}f`} x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves={2} seed={9} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={2.6} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      ) : null}
      <g
        filter={rough ? `url(#${id}f)` : undefined}
        fill="currentColor"
        stroke="currentColor"
        className="stamp-ink sutaeru-stamp-ink"
      >
        <circle cx="50" cy="50" r="45" fill="none" strokeWidth="4.5" />
        <circle cx="50" cy="50" r="38.5" fill="none" strokeWidth="1.6" />
        <path d={KANA["済"]} transform="translate(23.5 22) scale(0.053)" stroke="none" />
      </g>
    </svg>
  );
}
