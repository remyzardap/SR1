/**
 * View Transitions helper for screen-to-screen navigation.
 * Uses document.startViewTransition when available and reduced motion is not preferred.
 */

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
  if (
    typeof document !== "undefined" &&
    typeof (document as any).startViewTransition === "function" &&
    !prefersReducedMotion()
  ) {
    (document as any).startViewTransition(() => {
      navigate(to);
    });
  } else {
    navigate(to);
  }
}
