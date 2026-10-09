/**
 * View Transitions helper for screen-to-screen navigation.
 * Uses document.startViewTransition when available and reduced motion is not preferred.
 */

import { routeDirection, runRouteTransition } from "@/lib/motion/routeTransition";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      return true;
    }
    if (typeof document !== "undefined" && document.documentElement.getAttribute("data-reduce-motion") === "true") {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function navigateWithTransition(navigate: (to: string) => void, to: string): void {
  // The direction (M3 shared axis) is guessed from route depth; see lib/motion/routeTransition.ts.
  const from = typeof window !== "undefined" ? (window.location?.pathname ?? "") : "";
  runRouteTransition(() => navigate(to), routeDirection(from, to), prefersReducedMotion());
}
