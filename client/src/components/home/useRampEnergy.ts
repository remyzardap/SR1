import { useCallback, useEffect, useRef, type RefObject } from "react";
import { prefersReducedMotion } from "@/components/art/useMotion";

/**
 * The hero ramp breathes while someone types, then settles: it shows Sutaeru is
 * listening. Ported from the prototype's Home mount (design/sutaeru-app/app.js:566-585),
 * early return included — once the energy runs out the dots simply stay where they are.
 *
 * The dots are the ones HalftoneRamp renders inside `#ramp`, so the hook takes the
 * element that holds them rather than reaching for a document-wide id.
 */
export function useRampEnergy(containerRef: RefObject<HTMLElement | null>, listening: boolean): () => void {
  const energy = useRef(0);
  const phase = useRef(0);

  const pulse = useCallback(() => {
    energy.current = 1;
  }, []);

  useEffect(() => {
    // Under reduced motion the loop never starts, so the dots keep the still value.
    if (prefersReducedMotion()) return;
    let alive = true;
    let id = 0;
    const tick = () => {
      if (!alive) return;
      if (energy.current >= 0.01 || listening) {
        phase.current += 0.16;
        energy.current *= 0.97;
        const e = listening ? 1 : energy.current;
        containerRef.current
          ?.querySelectorAll<HTMLElement>("#ramp i")
          .forEach((dot, index) => dot.style.setProperty("--k", (1 + e * 0.7 * Math.sin(phase.current + index * 0.55)).toFixed(3)));
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(id);
    };
  }, [containerRef, listening]);

  // A recording that ends goes back to still, the way the prototype resets --k.
  useEffect(() => {
    if (listening) return;
    containerRef.current?.querySelectorAll<HTMLElement>("#ramp i").forEach((dot) => dot.style.setProperty("--k", "1"));
  }, [containerRef, listening]);

  return pulse;
}
