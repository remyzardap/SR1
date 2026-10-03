import { LinearDitherBar, ConvergeBar } from "@/components/art";
import { useThemeMode } from "@/hooks/useAppearance";
import type { ActivityItem } from "@/components/ActivityFeed";

export interface ChatRunCardProps {
  /** The live activity rows; used to count steps and to estimate the time left. */
  activity: ActivityItem[];
  /** The step currently running, already human readable. */
  label: string;
}

const MAX_ETA_SECONDS = 600;

/**
 * The running step: the art plus `STEP n OF m` and an estimated time left.
 * Light mode reads left to right (LinearDitherBar); the dark canvas shows the same
 * step converging from both edges, so dark mode uses ConvergeBar.
 *
 * Nothing from the server says how long a run takes, so the estimate is measured:
 * the mean duration of the steps that already finished, times the steps still open.
 * With no finished step to measure it shows no eta at all rather than a made-up one.
 */
export function ChatRunCard({ activity, label }: ChatRunCardProps) {
  const mode = useThemeMode();
  const total = Math.max(activity.length, 1);
  const runningIndex = activity.findIndex((item) => item.status === "running");
  const step = runningIndex >= 0 ? runningIndex + 1 : total;
  const finished = activity.filter((item) => item.status !== "running" && item.durationMs != null);
  const mean = finished.length ? finished.reduce((sum, item) => sum + (item.durationMs ?? 0), 0) / finished.length / 1000 : 0;
  const open = Math.max(total - step, 0) + (runningIndex >= 0 ? 0.5 : 0);
  const eta = mean > 0 ? Math.min(MAX_ETA_SECONDS, Math.round(mean * open)) : null;
  const progress = Math.min(0.95, (step - 0.5) / total);
  const stepLabel = `STEP ${step} OF ${total}`;
  const ariaLabel = label || "Working";

  return (
    <div className="sk-run-card" role="status" aria-live="polite">
      <div className="sk-run-head">
        <span className="sk-run-dot" aria-hidden="true" />
        <span className="sk-run-label">{ariaLabel}</span>
        <span className="sk-run-step">{stepLabel}</span>
      </div>
      {mode === "dark" ? (
        <ConvergeBar progress={progress} etaSeconds={eta} showPercent ariaLabel={ariaLabel} />
      ) : (
        <LinearDitherBar progress={progress} etaSeconds={eta} showPercent ariaLabel={ariaLabel} />
      )}
    </div>
  );
}

export default ChatRunCard;
