import { useId } from "react";

import type { Shot } from "@/lib/studio";

/* The composition sketch: the same camera choices drawn as a quiet SVG still life, so the exact
   framing stays readable when the photograph hides it. Colours are picture colours, so they do
   not follow the UI theme. World space is 1000 x 1000; the camera is a viewBox that crops,
   zooms and tilts it. */

const ZOOM = { detail: 2.6, close: 1.7, medium: 1.12, wide: 0.68 } as const;
const LENS_BLUR = { "24": 0, "35": 1.2, "50": 3, "85": 8, "100": 14 } as const;
const RIM_RY = { top: 1, high: 0.56, eye: 0.2, dutch: 0.2, low: 0.08 } as const;

const LIGHT = {
  window: { wallT: "#ECE7DC", wallB: "#DCD4C5", tabT: "#C29A72", tabB: "#9E7049", mug: "#F3F0E9", shade: "#C7C0B3", shadow: 0.34, len: 1, tint: "rgba(196,214,232,.12)" },
  golden: { wallT: "#F0CFA4", wallB: "#DCAA78", tabT: "#B9794A", tabB: "#8E5530", mug: "#F7EAD6", shade: "#CDA27A", shadow: 0.42, len: 1.9, tint: "rgba(255,146,56,.18)" },
  studio: { wallT: "#F2F2F0", wallB: "#DEDDDA", tabT: "#E2E1DD", tabB: "#D2D1CD", mug: "#F8F8F6", shade: "#C3C3BE", shadow: 0.2, len: 0.45, tint: "" },
  backlit: { wallT: "#E9E0CF", wallB: "#BFB4A3", tabT: "#9A7454", tabB: "#6F4E34", mug: "#EDE5D6", shade: "#A99E8C", shadow: 0.3, len: 1.3, tint: "rgba(255,248,230,.22)" },
  night: { wallT: "#3A3128", wallB: "#241E19", tabT: "#4B3A2C", tabB: "#2A2018", mug: "#CBBBA0", shade: "#7B6A55", shadow: 0.55, len: 1.1, tint: "rgba(255,170,80,.14)" },
} as const;

export function StudioSketch({ shot, label }: { shot: Shot; label?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const L = LIGHT[shot.light];
  const z = ZOOM[shot.shot];
  const top = shot.angle === "top";
  const horizon = top ? -100 : shot.angle === "high" ? 380 : shot.angle === "low" ? 720 : 560;
  const rx = 150;
  const ry = Math.max(14, rx * RIM_RY[shot.angle]);
  const cx = 500;
  const cy = top ? 500 : 640;
  const body = top ? 0 : 230 * (1 - RIM_RY[shot.angle] * 0.55);
  const size = 1000 / z;
  const vb = `${cx - size / 2} ${cy - body / 2 - size / 2} ${size} ${size}`;
  const tilt = shot.angle === "dutch" ? -9 : 0;
  const blur = LENS_BLUR[shot.lens];
  const film = shot.look === "film";
  const ink = shot.look === "ink";
  const sx = L.len * 120;

  return (
    <svg
      className="sketch"
      viewBox={vb}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      style={{ filter: ink ? "grayscale(1) contrast(1.5)" : film ? "sepia(.25) saturate(.8) contrast(.92)" : undefined }}
    >
      <defs>
        <linearGradient id={`${uid}w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={L.wallT} />
          <stop offset="1" stopColor={L.wallB} />
        </linearGradient>
        <linearGradient id={`${uid}t`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={L.tabT} />
          <stop offset="1" stopColor={L.tabB} />
        </linearGradient>
        <linearGradient id={`${uid}m`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={L.mug} />
          <stop offset=".62" stopColor={L.mug} />
          <stop offset="1" stopColor={L.shade} />
        </linearGradient>
        <filter id={`${uid}b`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation={blur} />
        </filter>
      </defs>
      <g transform={`rotate(${tilt} ${cx} ${cy})`}>
        <g filter={blur ? `url(#${uid}b)` : undefined}>
          <rect x="-1400" y="-1400" width="3800" height="3800" fill={`url(#${uid}w)`} />
          <rect x="-1400" y={horizon} width="3800" height="3800" fill={`url(#${uid}t)`} />
          {!top && <rect x="-1400" y={horizon - 2} width="3800" height="4" fill="rgba(0,0,0,.08)" />}
        </g>
        {/* shadow on the table */}
        <ellipse cx={cx + sx * 0.6} cy={cy + body * 0.5 + 6} rx={rx * 0.9 + sx * 0.5} ry={Math.max(20, ry * 0.7)} fill="#000" opacity={L.shadow} />
        {/* body */}
        {!top && <path d={`M${cx - rx} ${cy - body / 2} h${rx * 2} v${body} a${rx} ${ry} 0 0 1 ${-rx * 2} 0 Z`} fill={`url(#${uid}m)`} />}
        {!top && <path d={`M${cx + rx} ${cy - body * 0.15} q${rx * 0.55} 0 ${rx * 0.55} ${body * 0.28} t${-rx * 0.5} ${body * 0.28}`} fill="none" stroke={L.mug} strokeWidth="34" strokeLinecap="round" />}
        {/* rim and coffee */}
        <ellipse cx={cx} cy={cy - body / 2} rx={rx} ry={ry} fill={L.mug} />
        <ellipse cx={cx} cy={cy - body / 2 + ry * 0.06} rx={rx * 0.84} ry={ry * 0.82} fill="#3E2718" />
        <ellipse cx={cx - rx * 0.1} cy={cy - body / 2 + ry * 0.02} rx={rx * 0.5} ry={ry * 0.4} fill="#8A5C3A" opacity=".55" />
        {label && !top && (
          <text x={cx - rx * 0.1} y={cy + body * 0.24} textAnchor="middle" fontFamily="Inter Tight, system-ui, sans-serif" fontWeight="800" fontSize={Math.min(54, 330 / Math.max(4, label.length))} letterSpacing="2" fill="#242320" opacity=".86">
            {label}
          </text>
        )}
        {L.tint && <rect x="-1400" y="-1400" width="3800" height="3800" fill={L.tint} style={{ mixBlendMode: "soft-light" }} />}
      </g>
    </svg>
  );
}

export default StudioSketch;
