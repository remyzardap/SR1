import { SutaeruGlyph } from "./SutaeruGlyph";

/** Canonical mark for Sutaeru's sign-in and workspace surfaces. Full detail unless it is small. */
export function LandingMark({ className = "", detail = "full" }: { className?: string; detail?: "compact" | "full" }) {
  return <SutaeruGlyph className={className} detail={detail} />;
}
