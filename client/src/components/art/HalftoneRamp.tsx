import { cn } from "@/lib/utils";
import { clampProgress } from "./useMotion";

export interface HalftoneRampProps {
  /** Number of dot columns across the block. */
  columns: number;
  /** Number of dot rows; the block height is rows * cell. */
  rows: number;
  /** Grid pitch in px (design spec: 12). */
  cell?: number;
  /** Radius at the thin end and the thick end of the ramp (px). */
  minRadius?: number;
  maxRadius?: number;
  /**
   * 0..1 clear amount for the pending-image panel: dots disappear from the left
   * edge toward the right as progress grows. Omit for a static corner accent.
   */
  progress?: number;
  /** Stretch to the container width (viewBox scales uniformly, may crop). */
  fluid?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** Corner accent / pending-image panel: columns of dots with growing radius. */
export function HalftoneRamp({
  columns,
  rows,
  cell = 12,
  minRadius = 0.8,
  maxRadius = 3.6,
  progress,
  fluid = false,
  className,
  style,
}: HalftoneRampProps) {
  const width = columns * cell;
  const height = rows * cell + cell / 2;
  const clear = progress === undefined ? null : clampProgress(progress);
  const dots: React.ReactNode[] = [];

  for (let c = 0; c < columns; c++) {
    const t = columns > 1 ? c / (columns - 1) : 1;
    const r = minRadius + (maxRadius - minRadius) * t;
    let opacity = 1;
    if (clear !== null) {
      const threshold = clear * columns;
      opacity = Math.min(1, Math.max(0, (c - threshold + 1) / 1.5));
      if (opacity <= 0) continue;
    }
    // Odd columns sit half a row lower than even ones.
    const yShift = c % 2 === 1 ? cell / 2 : 0;
    for (let rIdx = 0; rIdx < rows; rIdx++) {
      dots.push(
        <circle
          key={`${c}-${rIdx}`}
          cx={c * cell + cell / 2}
          cy={rIdx * cell + cell / 2 + yShift}
          r={r}
          fill="currentColor"
          opacity={opacity}
        />
      );
    }
  }

  return (
    <svg
      className={cn("art-halftone", className)}
      style={style}
      width={fluid ? "100%" : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fluid ? "xMidYMid slice" : "xMidYMid meet"}
      aria-hidden="true"
    >
      {dots}
    </svg>
  );
}

export default HalftoneRamp;
