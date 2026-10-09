import { prefersReducedMotion as userPrefersReducedMotion } from "@/components/art/useMotion";

function safeReduced(): boolean {
  try {
    return userPrefersReducedMotion();
  } catch {
    return false;
  }
}

/**
 * Route transitions: the View Transitions API where it exists, nothing special where it does not
 * (pages then play the `.m-route-enter` CSS fade-through on mount). The direction is published as
 * data-vt on <html> for the length of the transition so motion.css can pick the M3 shared X axis.
 */
export type RouteDirection = "forward" | "back" | "fade";

type StartViewTransition = (update: () => void | Promise<void>) => { finished: Promise<void> };

export function supportsViewTransitions(): boolean {
  return typeof document !== "undefined" && typeof (document as unknown as { startViewTransition?: unknown }).startViewTransition === "function";
}

/** Depth of a path, to guess forward (deeper) or back (shallower) between two routes. */
export function routeDirection(from: string, to: string): RouteDirection {
  const depth = (p: string) => p.split("?")[0].split("/").filter(Boolean).length;
  const a = depth(from);
  const b = depth(to);
  if (b > a) return "forward";
  if (b < a) return "back";
  return "fade";
}

/** Runs `update` (the navigation) inside a view transition when supported, otherwise directly. */
export function runRouteTransition(update: () => void, direction: RouteDirection = "forward", reduced: boolean = safeReduced()): void {
  if (!supportsViewTransitions() || reduced) {
    update();
    return;
  }
  const root = document.documentElement;
  root?.setAttribute?.("data-vt", direction);
  const clear = () => root?.removeAttribute?.("data-vt");
  try {
    const t = (document as unknown as { startViewTransition: StartViewTransition }).startViewTransition(update);
    if (t && t.finished) t.finished.then(clear, clear);
    else clear();
  } catch {
    clear();
    update();
  }
}
