import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * DitherEdge — a graded dither edge built from adjacent bands instead of stacked full-size layers.
 *
 * The old version painted two dot lattices (3.5px and 7px) over the whole strip and masked each
 * one. Two regular grids on top of each other beat into a cross-hatch of X shapes (moiré), which is
 * exactly what the design review flagged. Now the strip is split along the direction into
 * DITHER_EDGE_BAND_COUNT adjacent bands, each carrying ONE lattice with its own grid and dot radius
 * (fine at the dissolving edge, coarse toward the interior), and each band's mask ramps the density
 * up from transparent. Neighbouring bands overlap by one crossfade and their masks are
 * complementary — they sum to 1 — so no pixel is ever covered by two lattices at full strength.
 * Every lattice is a `radial-gradient(circle, color r, transparent r+0.4px)` on a single
 * `background-size` pinned to the band origin, which keeps the dots round.
 *
 * `paperColor` adds the solid paper area at the inner end with a very faint dot texture fading in,
 * matching Run.dc.html. Geometry is derived from the canvas's radius/pitch ratios, so any grid
 * sizes a screen passes still get distinct pitches.
 */
export interface DitherEdgeProps {
  /** Edge that dissolves into the surface (default "bottom"). Density rises away from it. */
  direction?: "top" | "bottom" | "left" | "right";
  /** Grid pitch of the band touching the dissolving edge, in px (default 3.5). */
  fineGridSize?: number;
  /** Grid pitch of the innermost band, in px (default 7). */
  coarseGridSize?: number;
  /** Color token or CSS color (default "var(--r-ink)"). */
  color?: string;
  /** Solid paper color for the inner end of the strip, with a faint texture fading in. */
  paperColor?: string;
  /** Overall opacity (default 1). */
  opacity?: number;
  className?: string;
  id?: string;
  style?: React.CSSProperties;
}

export type DitherBandVariant = "dot" | "paper" | "texture";

export interface DitherMaskStop {
  /** Position along the band, in % of the band's own length (may exceed 100 for open ramps). */
  atPercent: number;
  /** Mask alpha at that stop. */
  alpha: number;
}

export interface DitherBand {
  /** "dot" = one dot lattice, "paper" = solid block, "texture" = faint dots over the paper. */
  variant: DitherBandVariant;
  /** Class/`data-band` suffix: fine | mid | coarse, then paper | texture when paper is set. */
  name: string;
  /** Dot grid pitch in px (0 for the solid paper band). */
  grid: number;
  /** Dot radius in px (0 for the solid paper band). */
  radius: number;
  /** Distance from the dissolving edge to the band's start, in % of the strip. */
  offsetPercent: number;
  /** Band length along the strip, in % of the strip. */
  extentPercent: number;
  /** Density ramps, as mask stops local to the band (first stop is always transparent). */
  stops: DitherMaskStop[];
  /** Extra opacity of the layer itself (the paper texture is faint). */
  layerOpacity: number;
}

export const DITHER_EDGE_BAND_COUNT = 3;

/** px between the two grids of neighbouring bands when a caller passes equal grid sizes. */
const MIN_PITCH_STEP_PX = 0.5;
/** Dot radius / grid pitch in the outermost and innermost dot bands. The design canvas uses
 * 1.1px on a 5px grid and 3px on a 7px grid; the component derives them from these two ratios so
 * round dots and distinct grids hold for any grid sizes a screen passes in. */
const DOT_RATIO_FINE = 0.22;
const DOT_RATIO_COARSE = 0.43;
/** px from the dot edge to full transparency, so a clipped circle still reads as a round dot. */
const DOT_EDGE_PX = 0.4;
/** Width of the crossfade between two neighbouring bands, as a fraction of one band. */
const CROSSFADE_FRACTION = 0.4;
/** Solid paper block over the inner end of the strip, and the length of its own mask ramp —
 * 28% and 45% are the canvas values. */
const PAPER_EXTENT_PERCENT = 28;
const PAPER_RAMP_PERCENT = 45;
/** Faint texture grid = the innermost band's pitch + this, so it never shares a grid either. */
const TEXTURE_EXTRA_PITCH_PX = 2;
const TEXTURE_DOT_RATIO = 0.09;
const TEXTURE_RAMP_PERCENT = 40;
const TEXTURE_OPACITY = 0.4;

const BAND_NAMES = ["fine", "mid", "coarse"];

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Express a position on the strip (in %) as a position inside a band (in % of that band). */
function toBandPercent(position: number, offset: number, extent: number) {
  return round2((100 * (position - offset)) / extent);
}

/**
 * Geometry of the bands: one dot lattice per band with its own grid and dot radius, bands laid out
 * next to each other along the strip and crossing over through complementary masks. Exported so
 * tests can assert the invariants (distinct grids, round dots, ramps starting transparent).
 */
export function computeDitherBands(
  fineGridSize: number,
  coarseGridSize: number,
  hasPaper: boolean
): DitherBand[] {
  // Grids climb monotonically from fine to coarse, and never collide: two layers on the same pitch
  // is what beat against each other into the old cross-hatch.
  const last = DITHER_EDGE_BAND_COUNT - 1;
  const step = Math.max((coarseGridSize - fineGridSize) / last, MIN_PITCH_STEP_PX);
  const cell = 100 / DITHER_EDGE_BAND_COUNT;
  const ramp = cell * CROSSFADE_FRACTION;
  const bands: DitherBand[] = [];

  for (let i = 0; i < DITHER_EDGE_BAND_COUNT; i++) {
    const grid = fineGridSize + step * i;
    const ratio = DOT_RATIO_FINE + ((DOT_RATIO_COARSE - DOT_RATIO_FINE) * i) / last;
    // A dot may not reach its cell edge or the dots merge into a field instead of staying round.
    const radius = round2(Math.max(Math.min(grid * ratio, grid / 2 - DOT_EDGE_PX), 0.1));
    const isInnermost = i === last;
    const offset = Math.max(i * cell - ramp / 2, 0);
    const end = isInnermost ? 100 : Math.min((i + 1) * cell + ramp / 2, 100);
    const extent = end - offset;
    // Full density is reached exactly where the previous band starts to fall away, so in the
    // crossfade the two masks sum to 1: no pixel is ever covered by two lattices at full strength.
    const rampIn = i === 0 ? cell - ramp / 2 : i * cell + ramp / 2;
    const rampOut = (i + 1) * cell - ramp / 2;
    const stops: DitherMaskStop[] = [
      { atPercent: 0, alpha: 0 },
      { atPercent: toBandPercent(rampIn, offset, extent), alpha: 1 },
    ];
    if (!isInnermost) {
      if (rampOut > rampIn) {
        stops.push({ atPercent: toBandPercent(rampOut, offset, extent), alpha: 1 });
      }
      stops.push({ atPercent: toBandPercent(rampOut + ramp, offset, extent), alpha: 0 });
    }
    bands.push({
      variant: "dot",
      name: BAND_NAMES[i],
      grid: round2(grid),
      radius,
      offsetPercent: round2(offset),
      extentPercent: round2(extent),
      stops,
      layerOpacity: 1,
    });
  }

  if (hasPaper) {
    const offset = 100 - PAPER_EXTENT_PERCENT;
    const textureGrid = bands[bands.length - 1].grid + TEXTURE_EXTRA_PITCH_PX;
    const paperStops: DitherMaskStop[] = [
      { atPercent: 0, alpha: 0 },
      { atPercent: PAPER_RAMP_PERCENT, alpha: 1 },
    ];
    // The paper is painted over the inner ends of the dot bands, which is what hides their cuts.
    bands.push({
      variant: "paper",
      name: "paper",
      grid: 0,
      radius: 0,
      offsetPercent: offset,
      extentPercent: PAPER_EXTENT_PERCENT,
      stops: paperStops,
      layerOpacity: 1,
    });
    bands.push({
      variant: "texture",
      name: "texture",
      grid: round2(textureGrid),
      radius: round2(textureGrid * TEXTURE_DOT_RATIO),
      offsetPercent: offset,
      extentPercent: PAPER_EXTENT_PERCENT,
      stops: [
        { atPercent: 0, alpha: 0 },
        { atPercent: TEXTURE_RAMP_PERCENT, alpha: 1 },
      ],
      layerOpacity: TEXTURE_OPACITY,
    });
  }

  return bands;
}

/** Axis the density grows along, so the named edge is always the one that dissolves. */
const DENSITY_AXIS: Record<NonNullable<DitherEdgeProps["direction"]>, string> = {
  bottom: "to top",
  top: "to bottom",
  left: "to right",
  right: "to left",
};

/** Box for one band, anchored on the named (dissolving) edge and growing inward. */
function bandBox(
  direction: NonNullable<DitherEdgeProps["direction"]>,
  offset: number,
  extent: number
): React.CSSProperties {
  const from = `${round2(offset)}%`;
  const size = `${round2(extent)}%`;
  if (direction === "bottom") return { left: 0, right: 0, bottom: from, height: size };
  if (direction === "top") return { left: 0, right: 0, top: from, height: size };
  if (direction === "left") return { top: 0, bottom: 0, left: from, width: size };
  return { top: 0, bottom: 0, right: from, width: size };
}

function maskFor(band: DitherBand, axis: string) {
  const stops = band.stops.map((s) => `rgba(0,0,0,${s.alpha}) ${s.atPercent}%`).join(", ");
  return `linear-gradient(${axis}, ${stops})`;
}

/**
 * DitherEdge:
 * Graded dither bands — the stipple is split into adjacent bands along `direction`, one dot lattice
 * each, finest and smallest at the dissolving edge, coarser and larger toward the inner end. Ported
 * from the dither bands in `design/sutaeru-canvas/Run.dc.html`.
 *
 * Bands crossfade through complementary masks instead of stacking, and every band sits on its own
 * grid with `background-position` pinned to the band origin, so two lattices can never beat into
 * the X / plaid pattern that full-area stacked layers produced.
 */
export function DitherEdge({
  direction = "bottom",
  fineGridSize = 3.5,
  coarseGridSize = 7,
  color = "var(--r-ink)",
  paperColor,
  opacity = 1,
  className,
  id,
  style,
}: DitherEdgeProps) {
  const axis = DENSITY_AXIS[direction];
  const bands = computeDitherBands(fineGridSize, coarseGridSize, paperColor !== undefined);

  return (
    <div
      id={id}
      className={cn("art-dither-edge", className)}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        pointerEvents: "none",
        opacity,
        ...style,
      }}
      data-direction={direction}
      aria-hidden="true"
    >
      {bands.map((band) => {
        const mask = maskFor(band, axis);
        const dotColor = band.variant === "texture" ? paperColor : color;
        const lattice: React.CSSProperties =
          band.variant === "paper"
            ? { background: paperColor }
            : {
                backgroundImage:
                  `radial-gradient(circle at 50% 50%, ${dotColor} ${band.radius}px, ` +
                  `transparent ${round2(band.radius + DOT_EDGE_PX)}px)`,
                backgroundSize: `${band.grid}px ${band.grid}px`,
                backgroundPosition: "0px 0px",
              };
        const bandStyle: React.CSSProperties = {
          position: "absolute",
          ...bandBox(direction, band.offsetPercent, band.extentPercent),
          ...lattice,
          maskImage: mask,
          WebkitMaskImage: mask,
          opacity: band.layerOpacity,
        };
        return (
          <div
            key={band.name}
            data-band={band.name}
            className={cn("art-dither-edge-band", `art-dither-edge-${band.name}`)}
            style={bandStyle}
          />
        );
      })}
    </div>
  );
}

export default DitherEdge;
