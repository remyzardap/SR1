import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/components/art/useMotion";

/**
 * The prototype's upload bar climbs for 1.4s (`a.p = RM() ? 1 : clamp((t - t0) / 1400)`
 * in design/sutaeru-app/app.js:676-680) and then stops on its own, because its "upload"
 * is invented. A real file is read by the browser, and nothing reports how far that has
 * got, so the row keeps the prototype's climb and the read finishing is what takes the
 * bar away.
 */
export function useUploadRamp(startedAt: number | null | undefined): number {
  const [progress, setProgress] = useState(() => (startedAt == null || prefersReducedMotion() ? 1 : 0));
  const startRef = useRef(startedAt);
  startRef.current = startedAt;

  useEffect(() => {
    if (startedAt == null) {
      setProgress(1);
      return;
    }
    if (prefersReducedMotion()) {
      setProgress(1);
      return;
    }
    let alive = true;
    let frame = 0;
    const tick = (t: number) => {
      if (!alive) return;
      const next = Math.min(1, (t - (startRef.current ?? t)) / 1400);
      setProgress(next);
      if (next < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, [startedAt]);

  return progress;
}
