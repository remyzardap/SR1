import type { CSSProperties } from "react";

// ── Fonts ──────────────────────────────────────────────────────────────────
export const F  = "'Inter', system-ui, -apple-system, sans-serif";
export const FD = "'DM Serif Display', 'Georgia', 'Times New Roman', serif";
export const FM = "'SF Mono', 'Menlo', 'Consolas', monospace";

// Opera Neon design language fonts (used by the login page)
export const NEON_FD = "'Syne', sans-serif";
export const NEON_FB = "'Inter', system-ui, -apple-system, sans-serif";
export const NEON_FM = "'DM Mono', 'Menlo', 'Consolas', monospace";

// ── Colors ─────────────────────────────────────────────────────────────────
export const MOCHA        = "#A47764";
export const MOCHA_DARK   = "#8f6654";
export const MOCHA_DEEP   = "#926a56";
export const MOCHA_PALE   = "#f0e8e0";
export const AMBER        = "#e8913a";
export const AMBER_DARK   = "#d4802e";
export const AMBER_LIGHT  = "#f0a050";
export const AMBER_PALE   = "#fef3e2";
export const DARK_CARD    = "#1e1812";
export const DARK_CARD_2  = "#2a2018";
export const TEXT_PRIMARY = "#1e150d";
export const TEXT_MUTED   = "#a39080";
export const TEXT_SOFT    = "#b0a090";
export const TEXT_FAINT   = "#c4b5a4";
export const GREEN        = "#5a8a5a";
export const GREEN_LIGHT  = "#7abe8e";
export const BLUE         = "#8a9cc7";
export const SALMON       = "#d4917a";

// ── Opera Neon palette ─────────────────────────────────────────────────────
export const NEON = {
  cream:       "#f5f0e8",
  creamWarm:   "#f0e6d6",
  creamCool:   "#e8e2d6",
  black:       "#0a0a0a",
  ink:         "#111111",
  charcoal:    "#1a1a1a",
  muted:       "#7a7368",
  soft:        "#a39b8e",
  orange:      "#e8442a",
  orangePale:  "#ffefea",
  orangeDim:   "rgba(232,68,42,0.12)",
  white:       "#f5f0e8",
  panelBg:     "#0a0a0a",
  panelText:   "#f5f0e8",
  gridLine:    "rgba(10,10,10,0.08)",
};

export const NEON_TAGS = [
  { bg: "#f4e7e7", text: "#8a3a3a" },
  { bg: "#e7f0e7", text: "#2f5a2f" },
  { bg: "#e7edf4", text: "#2f4a6a" },
  { bg: "#f0edf4", text: "#5a2f6a" },
  { bg: "#f4f0e7", text: "#6a542f" },
  { bg: "#e7f4f2", text: "#2f6a5e" },
];

// ── Base card ──────────────────────────────────────────────────────────────
export const card: CSSProperties = {
  background: "#fff",
  borderRadius: 22,
  boxShadow: "0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.05)",
  border: "1px solid rgba(0,0,0,0.04)",
  transition: "transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94), box-shadow 0.3s ease",
  position: "relative",
  overflow: "hidden",
};

export const cardHover: CSSProperties = {
  transform: "translateY(-4px)",
  boxShadow: "0 2px 4px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.08)",
};

export const glassCard: CSSProperties = {
  background: "rgba(255,255,255,0.65)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderRadius: 22,
  boxShadow: "0 1px 2px rgba(0,0,0,0.03), 0 8px 32px rgba(0,0,0,0.06)",
  border: "1px solid rgba(255,255,255,0.6)",
  transition: "transform 0.3s ease, box-shadow 0.3s ease",
  position: "relative",
  overflow: "hidden",
};

// ── Tier 1: White card shine (shineLight + innerGlowLight + edgeHighlight) ─
export const shineLight: CSSProperties = {
  position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
  borderRadius: "inherit", pointerEvents: "none",
  background: "linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.15) 25%, transparent 50%, rgba(255,255,255,0.05) 80%, rgba(255,255,255,0.3) 100%)",
};

export const innerGlowLight: CSSProperties = {
  position: "absolute", top: 0, left: 0, right: 0, height: "45%",
  borderRadius: "inherit", pointerEvents: "none",
  background: "linear-gradient(180deg, rgba(255,255,255,0.5) 0%, transparent 100%)",
};

// ── Tier 2: Colored/dark card shine (shineStrong + innerGlowStrong) ────────
export const shineStrong: CSSProperties = {
  position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
  borderRadius: "inherit", pointerEvents: "none",
  background: "linear-gradient(135deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.08) 25%, transparent 45%, rgba(255,255,255,0.04) 75%, rgba(255,255,255,0.18) 100%)",
};

export const innerGlowStrong: CSSProperties = {
  position: "absolute", top: 0, left: 0, right: 0, height: "50%",
  borderRadius: "inherit", pointerEvents: "none",
  background: "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)",
};

// ── Edge highlight (used on ALL cards) ────────────────────────────────────
export const edgeHighlight: CSSProperties = {
  position: "absolute", top: 0, left: 0, right: 0, height: 1,
  borderRadius: "inherit", pointerEvents: "none",
  background: "linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.8) 50%, transparent 90%)",
};

// ── Page background ────────────────────────────────────────────────────────
export const PAGE_BG: CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(165deg, #f5efe7, #ecdfc9, #e2d4c0, #d9cbb8, #e4d8c6, #f0e8dc)",
  backgroundSize: "300% 300%",
  animation: "bgShift 20s ease-in-out infinite",
  fontFamily: F,
  position: "relative",
};

export const NEON_PAGE_BG: CSSProperties = {
  minHeight: "100vh",
  background: NEON.cream,
  fontFamily: NEON_FB,
  position: "relative",
};

export const NEON_GRID: CSSProperties = {
  position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
  backgroundImage: `
    linear-gradient(to right, ${NEON.gridLine} 1px, transparent 1px),
    linear-gradient(to bottom, ${NEON.gridLine} 1px, transparent 1px)
  `,
  backgroundSize: "64px 64px",
};

export const NOISE_OVERLAY: CSSProperties = {
  position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
  opacity: 0.035,
  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
  backgroundRepeat: "repeat",
  backgroundSize: "256px 256px",
};

// ── Animations ────────────────────────────────────────────────────────────
export const CSS_ANIM = `
@keyframes bgShift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes logoPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(232,145,58,0); }
  50% { box-shadow: 0 0 16px 4px rgba(232,145,58,0.35); }
}
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;
