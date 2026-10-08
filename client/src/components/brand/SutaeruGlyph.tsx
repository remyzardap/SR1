import * as React from "react";
import { useId, type SVGProps } from "react";
import { cn } from "@/lib/utils";

export interface SutaeruGlyphProps extends SVGProps<SVGSVGElement> {
  className?: string;
  /**
   * "full" for large use (hero, splash, sign-in, app icon).
   * "compact" for 48 px and below (survives at icon size: loop + gate only, no sun/sea/glint).
   */
  detail?: "full" | "compact";
  size?: number;
  /** Legacy alias for showing/hiding the sun in full detail. */
  signal?: boolean;
  /** Explicit control over the rising sun. */
  sun?: boolean;
}

const LOOP = "M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z";
const KASAGI = "M89.2 21.4L90.5 22.5Q108 27.1 125.5 22.5L126.8 21.4L126.2 25.0Q108 29.9 89.8 25.0Z";
const SHIMAKI = "M91.6 26.7Q108 30.7 124.4 26.7L124.2 28.9Q108 32.9 91.8 28.9Z";
const NUKI = "M90.6 35.1H125.4V37.7H90.6Z";
const GAKU = "M106.7 30.4H109.3V35.2H106.7Z";
const POSTS = "M95.8 27.6H99.6L98.6 57.6H94.4ZM116.4 27.6H120.2L121.6 57.6H117.4Z";

const KASAGI_C = "M88.6 20.8L90.4 22.2Q108 27.4 125.6 22.2L127.4 20.8L126.6 26.0Q108 31.4 89.4 26.0Z";
const NUKI_C = "M89.8 34.6H126.2V38.4H89.8Z";
const POSTS_C = "M95.6 25.5H99.8L98.8 57.6H94.4ZM116.2 25.5H120.4L121.6 57.6H117.2Z";

/**
 * Sutaeru brand mark: twin-lens loop with torii gate.
 * Detail "full" adds the rising sun, sea line, and water glint.
 * Detail "compact" keeps only the loop and gate for small sizes.
 */
export function SutaeruGlyph({
  className,
  detail = "full",
  size,
  signal = true,
  sun = true,
  width,
  height,
  ...props
}: SutaeruGlyphProps) {
  const clipId = `sc${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const full = detail === "full";
  const showSun = full && sun !== false && signal !== false;

  const resolvedWidth = size ?? width;
  const resolvedHeight = size ? Math.round((size * 76) / 144) : height;

  return (
    <svg
      viewBox="0 0 144 76"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Sutaeru"
      width={resolvedWidth}
      height={resolvedHeight}
      className={cn("glyph sutaeru-glyph", className)}
      {...props}
    >
      <path
        className="loop sutaeru-glyph-loop"
        d={LOOP}
        pathLength={1}
        stroke="currentColor"
        strokeWidth="9"
        strokeLinejoin="round"
      />
      {full ? (
        <g transform="translate(108 39) scale(.9) translate(-108 -39)">
          {showSun ? (
            <>
              <clipPath id={clipId}>
                <rect x="84" y="10" width="48" height="50.2" />
              </clipPath>
              <g clipPath={`url(#${clipId})`}>
                <circle
                  cx="108"
                  cy="46.4"
                  r="6.3"
                  className="sun sutaeru-glyph-sun"
                  fill="var(--accent, #F4511E)"
                />
              </g>
            </>
          ) : null}
          <g className="gate sutaeru-glyph-gate" fill="currentColor">
            <path d={KASAGI} />
            <path d={SHIMAKI} />
            <path d={GAKU} />
            <path d={NUKI} />
            <path d={POSTS} />
          </g>
          <g className="sea sutaeru-glyph-sea" strokeLinecap="round">
            <path
              d="M91.6 60.6H103.2M112.8 60.6H124.4"
              stroke="currentColor"
              strokeWidth="1.7"
            />
          </g>
          {showSun ? (
            <g className="glint sutaeru-glyph-glint" strokeLinecap="round">
              <path
                d="M104.8 60.6H111.2"
                stroke="var(--accent, #F4511E)"
                strokeWidth="1.7"
              />
              <path
                d="M106.3 63.8H109.7"
                stroke="var(--accent, #F4511E)"
                strokeWidth="1.5"
              />
            </g>
          ) : null}
        </g>
      ) : (
        <g transform="translate(108 39) scale(.94) translate(-108 -39)">
          <g className="gate sutaeru-glyph-gate" fill="currentColor">
            <path d={KASAGI_C} />
            <path d={NUKI_C} />
            <path d={POSTS_C} />
          </g>
        </g>
      )}
    </svg>
  );
}

export default SutaeruGlyph;
