import React from "react";

type LogoVariant = "light" | "dark";
type LogoSize = "sm" | "md" | "lg";

interface LogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
  showWordmark?: boolean;
  className?: string;
}

const sizeMap: Record<LogoSize, { tree: number; text: number; spacing: number }> = {
  sm: { tree: 24, text: 10, spacing: 4 },
  md: { tree: 40, text: 14, spacing: 6 },
  lg: { tree: 64, text: 20, spacing: 10 },
};

export function Logo({
  variant = "light",
  size = "md",
  showWordmark = true,
  className = "",
}: LogoProps) {
  const fill = variant === "light" ? "#FFFFFF" : "#0A0A0B";
  const { tree, text, spacing } = sizeMap[size];

  return (
    <div
      className={`flex flex-col items-center ${className}`}
      style={{ gap: spacing }}
    >
      {/* Tree SVG — inline for full color control */}
      <svg
        width={tree}
        height={Math.round(tree * 0.85)}
        viewBox="0 0 120 102"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Sutaeru tree logo"
      >
        {/* Canopy leaf clusters */}
        <ellipse cx="60" cy="18" rx="9" ry="12" fill={fill} />
        <ellipse cx="42" cy="22" rx="10" ry="13" fill={fill} transform="rotate(-15 42 22)" />
        <ellipse cx="78" cy="22" rx="10" ry="13" fill={fill} transform="rotate(15 78 22)" />
        <ellipse cx="28" cy="34" rx="11" ry="14" fill={fill} transform="rotate(-20 28 34)" />
        <ellipse cx="92" cy="34" rx="11" ry="14" fill={fill} transform="rotate(20 92 34)" />
        <ellipse cx="22" cy="50" rx="12" ry="13" fill={fill} transform="rotate(-10 22 50)" />
        <ellipse cx="98" cy="50" rx="12" ry="13" fill={fill} transform="rotate(10 98 50)" />
        <ellipse cx="32" cy="62" rx="13" ry="11" fill={fill} transform="rotate(-5 32 62)" />
        <ellipse cx="88" cy="62" rx="13" ry="11" fill={fill} transform="rotate(5 88 62)" />
        <ellipse cx="60" cy="38" rx="18" ry="22" fill={fill} />
        <ellipse cx="60" cy="58" rx="16" ry="14" fill={fill} />
        <ellipse cx="44" cy="48" rx="12" ry="14" fill={fill} />
        <ellipse cx="76" cy="48" rx="12" ry="14" fill={fill} />
        {/* Trunk */}
        <path
          d="M52 68 Q54 72 55 80 L55 95 L65 95 L65 80 Q66 72 68 68 Z"
          fill={fill}
        />
        {/* Base line */}
        <rect x="38" y="95" width="44" height="3.5" rx="1.75" fill={fill} />
      </svg>

      {/* Wordmark */}
      {showWordmark && (
        <span
          style={{
            fontFamily: "'Oranienbaum', Georgia, serif",
            fontSize: text,
            color: fill,
            letterSpacing: "0.35em",
            fontWeight: 400,
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          SUTAERU
        </span>
      )}
    </div>
  );
}

export default Logo;
