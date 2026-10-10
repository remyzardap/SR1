import { cn } from "@/lib/utils";

export interface RunReadoutProps {
  /** 0..1 */
  progress: number;
  /** The calm mono word for the stage ("Drawing"). */
  word: string;
  /** Honest time left, or a calm note once the usual time has passed. */
  timeText: string;
  slow: boolean;
  /** One quiet sentence under the line, shown when the run is slow. */
  note?: string;
}

/**
 * One mono line and a hairline of progress. The fill is a transform, so it costs nothing to move;
 * a soft light travels along it, so even a held bar is visibly alive.
 */
export function RunReadout({ progress, word, timeText, slow, note }: RunReadoutProps) {
  const p = Math.min(1, Math.max(0, progress));
  return (
    <div className={cn("rr", slow && "is-slow")} role="status" aria-live="polite">
      <div className="rr-line mono">
        <span className="rr-word">
          <i className="rr-dot" aria-hidden="true" />
          {word}
        </span>
        <span className="rr-time tnum">{timeText}</span>
      </div>
      <div className="rr-track" role="progressbar" aria-label="Image progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}>
        <span className="rr-fill" style={{ transform: `scaleX(${p.toFixed(4)})` }} />
        <span className="rr-glint" aria-hidden="true" />
      </div>
      {slow && note && <p className="rr-note">{note}</p>}
    </div>
  );
}
