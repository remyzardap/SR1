import type { CSSProperties } from "react";

// ── Fonts ──────────────────────────────────────────────────────────────────
export const F  = "'Inter', system-ui, -apple-system, sans-serif";
export const FD = "'Inter Tight', 'Inter', sans-serif";
export const FM = "'JetBrains Mono', 'Menlo', 'Consolas', monospace";

// Opera Neon design language fonts (used by the login page)
export const NEON_FD = "'Inter Tight', 'Inter', sans-serif";
export const NEON_FB = "'Inter', system-ui, -apple-system, sans-serif";
export const NEON_FM = "'JetBrains Mono', monospace";

// ── Colors ─────────────────────────────────────────────────────────────────
export const MOCHA        = "#242320";
export const MOCHA_DARK   = "#3A3936";
export const MOCHA_DEEP   = "#4A4A46";
export const MOCHA_PALE   = "#EFEDE7";
export const AMBER        = "#8B8B8B";
export const AMBER_DARK   = "#6E6E6A";
export const AMBER_LIGHT  = "#A8A8A4";
export const AMBER_PALE   = "#EFEDE7";
export const DARK_CARD    = "#242320";
export const DARK_CARD_2  = "#3A3936";
export const TEXT_PRIMARY = "#242320";
export const TEXT_MUTED   = "#8B8B8B";
export const TEXT_SOFT    = "#A8A8A4";
export const TEXT_FAINT   = "#C8C5BD";
export const GREEN        = "#4F6B4F";
export const GREEN_LIGHT  = "#6E8A6E";
export const BLUE         = "#6E6E6A";
export const SALMON       = "#B3402A";

// ── Opera Neon palette ─────────────────────────────────────────────────────
export const NEON = {
  cream:       "#F7F6F2",
  creamWarm:   "#EFEDE7",
  creamCool:   "#E7E5DF",
  black:       "#242320",
  ink:         "#242320",
  charcoal:    "#3A3936",
  muted:       "#66645F",
  soft:        "#A8A8A4",
  orange:      "#F4511E",
  orangePale:  "#FCE9DF",
  orangeDim:   "rgba(244,81,30,0.10)",
  white:       "#F7F6F2",
  panelBg:     "#242320",
  panelText:   "#F7F6F2",
};

// ── Page background & overlays ─────────────────────────────────────────────
export const NEON_PAGE_BG: CSSProperties = {
  minHeight: "100vh",
  background: NEON.cream,
  fontFamily: NEON_FB,
  position: "relative",
};

export const NOISE_OVERLAY: CSSProperties = {
  position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
  opacity: 0.05,
  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
  backgroundRepeat: "repeat",
  backgroundSize: "256px 256px",
};
