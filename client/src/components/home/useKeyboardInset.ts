import { useEffect } from "react";

/**
 * Keeps a docked composer above the on-screen keyboard, the way the prototype's
 * `.kb-open` rule does: the inset is published as `--kb` on the root and the class goes
 * with it, so `.kb-open .home-dock` can lift the dock. The prototype shipped the rule
 * and never set it; the visual keyboard is what tells us the inset.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const apply = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      root.classList.toggle("kb-open", inset > 0);
      root.style.setProperty("--kb", `${Math.round(inset)}px`);
    };
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      root.classList.remove("kb-open");
      root.style.setProperty("--kb", "0px");
    };
  }, []);
}
