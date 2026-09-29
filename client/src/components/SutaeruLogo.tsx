import { cn } from "@/lib/utils";
import { SutaeruGlyph } from "./SutaeruGlyph";

export type LogoSize = "sm" | "md" | "lg" | "xl";
export type LogoVariant = "dark" | "light";

export interface SutaeruLogoProps {
  size?: LogoSize;
  variant?: LogoVariant;
  showTagline?: boolean;
  tagline?: string;
  className?: string;
  onClick?: () => void;
}

const sizes: Record<LogoSize, { mark: string; title: string; tagline: string }> = {
  sm: { mark: "w-16", title: "text-xs", tagline: "text-[8px]" },
  md: { mark: "w-24", title: "text-sm", tagline: "text-[10px]" },
  lg: { mark: "w-32", title: "text-base", tagline: "text-xs" },
  xl: { mark: "w-44", title: "text-lg", tagline: "text-sm" },
};

export function SutaeruLogo({
  size = "md",
  variant = "light",
  showTagline = false,
  tagline = "Your persistent AI identity in the cloud",
  className,
  onClick,
}: SutaeruLogoProps) {
  const config = sizes[size];
  const color = variant === "light" ? "var(--primary-foreground)" : "var(--foreground)";

  return (
    <div
      onClick={onClick}
      className={cn("inline-flex flex-col items-center", onClick && "cursor-pointer", className)}
      style={{ color }}
    >
      <SutaeruGlyph className={config.mark} />
      <span className={cn("mt-3 font-semibold", config.title)}>Sutaeru</span>
      {showTagline ? <span className={cn("mt-1 text-muted-foreground", config.tagline)}>{tagline}</span> : null}
    </div>
  );
}

export interface SutaeruLogoIconProps {
  size?: number;
  variant?: LogoVariant;
  className?: string;
  onClick?: () => void;
}

export function SutaeruLogoIcon({ size = 40, variant = "light", className, onClick }: SutaeruLogoIconProps) {
  const color = variant === "light" ? "var(--primary-foreground)" : "var(--foreground)";
  return <SutaeruGlyph width={size} height={Math.round(size * 0.53)} className={className} onClick={onClick} style={{ color }} />;
}

export interface SutaeruWordmarkProps {
  size?: LogoSize;
  variant?: LogoVariant;
  className?: string;
}

export function SutaeruWordmark({ size = "md", variant = "light", className }: SutaeruWordmarkProps) {
  const color = variant === "light" ? "var(--primary-foreground)" : "var(--foreground)";
  return <span className={cn("font-semibold", sizes[size].title, className)} style={{ color }}>Sutaeru</span>;
}

export default SutaeruLogo;