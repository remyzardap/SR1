import { HalftoneRamp } from "@/components/art";

export interface OfflineBannerProps {
  className?: string;
  message?: string;
  subMessage?: string;
}

export function OfflineBanner({ className, message = "You&apos;re offline. Past chats are still here.", subMessage = "New questions wait to send." }: OfflineBannerProps) {
  return (
    <aside className={`sk-offline-banner ${className || ""}`} role="status" aria-live="polite">
      <div className="sk-offline-copy">
        <span className="sk-offline-kicker mono">No connection</span>
        <p className="sk-offline-title">{message}</p>
        <p className="sk-offline-sub">{subMessage}</p>
      </div>
      <span className="sk-offline-ramp" aria-hidden="true">
        <HalftoneRamp columns={9} rows={6} cell={11} maxRadius={3.2} />
      </span>
    </aside>
  );
}

export default OfflineBanner;