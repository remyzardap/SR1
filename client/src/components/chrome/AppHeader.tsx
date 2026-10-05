import { cn } from "@/lib/utils";
import { SutaeruGlyph } from "@/components/SutaeruGlyph";
import { NavLogoMenu } from "./NavLogoMenu";

export interface AppHeaderProps {
  /** Mono word at x76 (WORKSPACE, MORE, OFFLINE...). */
  label: string;
  /** Initial shown in the ink avatar circle on the right. */
  userInitial?: string;
  className?: string;
}

/** Two small crosshairs at the top corners, per the design canvas. */
function Crosshair({ className }: { className?: string }) {
  return (
    <svg className={cn("skx-crosshair", className)} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 0V14M0 7H14" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/** The real Sutaeru symbol: twin lenses, the torii gate and the rising sun. */
export function LogoMark({ className }: { className?: string }) {
  return <SutaeruGlyph className={cn("skx-logo", className)} />;
}

/**
 * Mobile app header: crosshairs at (12,12) and (364,12), the header row at y 50..94
 * with interactive logo menu trigger, mono label and a 44px ink avatar. Desktop keeps the sidebar instead.
 */
export function AppHeader({ label, userInitial = "?", className }: AppHeaderProps) {
  const initial = userInitial.charAt(0).toUpperCase();
  return (
    <header className={cn("skx-header", className)}>
      <Crosshair className="skx-crosshair-tl" />
      <Crosshair className="skx-crosshair-tr" />
      <div className="skx-header-row">
        <NavLogoMenu variant="header" />
        <span className="skx-header-label">{label}</span>
        <span className="skx-avatar" aria-hidden="true">{initial}</span>
      </div>
    </header>
  );
}

export default AppHeader;
