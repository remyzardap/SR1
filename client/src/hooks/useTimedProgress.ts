import { useEffect, useRef, useState } from "react";

export interface TimedProgress {
  /** 0..~0.95 while running, 1 once the run finished. */
  progress: number;
  /** Estimated seconds left, counting down from the estimate. */
  etaSeconds: number;
  /** Whole seconds the run has been going; useful for a `TOOK n S` readout. */
  elapsedSeconds: number;
}

/**
 * Progress for a run that reports no percentage: the bar creeps toward (but
 * never reaches) the middle while the job runs, against an expected duration,
 * and snaps to done when the job finishes. The estimate is shown as
 * "ABOUT N S LEFT", so it reads as what it is: an estimate.
 */
export function useTimedProgress(running: boolean, estimateSeconds: number): TimedProgress {
  const startRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => {
      if (startRef.current) setElapsed((Date.now() - startRef.current) / 1000);
    }, 400);
    return () => window.clearInterval(id);
  }, [running]);

  const estimate = Math.max(1, estimateSeconds);
  if (!running) {
    return { progress: 1, etaSeconds: 0, elapsedSeconds: Math.round(elapsed) };
  }
  // Ease toward 95% so the bar keeps moving but never claims it is done.
  const progress = 0.95 * (1 - Math.exp((-3 * elapsed) / estimate));
  const etaSeconds = Math.max(0, estimate * (1 - Math.min(1, elapsed / estimate)));
  return { progress, etaSeconds, elapsedSeconds: Math.round(elapsed) };
}
