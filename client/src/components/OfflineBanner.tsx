import { HalftoneRamp } from "@/components/art";

/**
 * Offline banner: an ink card with the mono NO CONNECTION kicker, one line of
 * plain promise, and a dither ramp that fades out to the right. Shown at the top
 * of the transcript; the messages below stay readable.
 */
export function OfflineBanner() {
  return (
    <aside className="sk-offline-banner" role="status" aria-live="polite">
      <div className="sk-offline-copy">
        <span className="sk-offline-kicker">No connection</span>
        <p className="sk-offline-title">You're offline. Past chats are still here.</p>
      </div>
      <span className="sk-offline-ramp" aria-hidden="true">
        <HalftoneRamp columns={9} rows={6} cell={11} maxRadius={3.2} />
      </span>
    </aside>
  );
}

export default OfflineBanner;
