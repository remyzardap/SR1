import { SutaeruGlyph } from "./SutaeruGlyph";

/** Compact canonical mark used across Sutaeru's sign-in and workspace surfaces. */
export function LandingMark({ className = "" }: { className?: string }) {
  return <SutaeruGlyph className={className} />;
}
