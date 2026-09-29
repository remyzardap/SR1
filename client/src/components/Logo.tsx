import { SutaeruGlyph } from "./SutaeruGlyph";

type LogoVariant = "light" | "dark";
type LogoSize = "sm" | "md" | "lg";

interface LogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
  showWordmark?: boolean;
  className?: string;
}

const sizes: Record<LogoSize, { mark: string; text: string }> = {
  sm: { mark: "w-12", text: "text-[10px]" },
  md: { mark: "w-20", text: "text-sm" },
  lg: { mark: "w-28", text: "text-xl" },
};

export function Logo({ variant = "light", size = "md", showWordmark = true, className = "" }: LogoProps) {
  const config = sizes[size];
  const color = variant === "light" ? "var(--primary-foreground)" : "var(--foreground)";

  return (
    <div className={`inline-flex items-center gap-3 ${className}`} style={{ color }}>
      <SutaeruGlyph className={config.mark} />
      {showWordmark ? <span className={`${config.text} font-semibold`}>Sutaeru</span> : null}
    </div>
  );
}

export default Logo;