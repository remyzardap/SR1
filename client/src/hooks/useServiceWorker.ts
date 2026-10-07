import { useEffect } from "react";
import { toast } from "sonner";
import { getActiveStreamCount, subscribeActiveStreams } from "@/lib/activeStreams";

const UPDATE_TOAST_ID = "sutaeru-sw-update";

/**
 * Registers the service worker and makes its update flow explicit.
 *
 * `sw.js` never skips waiting on its own: it installs a *waiting* worker and obeys a
 * single message, `{ type: "skip-waiting" }`. Everything that decides **when** an
 * update may be applied therefore lives here on the page, because a counter inside
 * the worker could not gate itself - `postMessage` reaches the *controlling* worker
 * while `skipWaiting()` runs in the *waiting* one (see `lib/activeStreams.ts`).
 *
 * The flow is: worker waits -> toast appears -> Refresh posts `skip-waiting` while no
 * stream is active -> the worker activates and calls `clients.claim()` -> reload.
 * While a stream is active the button stays honest: it explains the deferral instead
 * of pretending nothing happened, and becomes actionable the moment the count drops.
 */
export function useServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

    let disposed = false;
    let toastClosed = false;
    let waitingWorker: ServiceWorker | null = null;
    let unsubscribeStreams: (() => void) | null = null;

    const stopWatchingStreams = () => {
      toastClosed = true;
      unsubscribeStreams?.();
      unsubscribeStreams = null;
    };

    /** Re-renders the persistent toast for the current stream state. */
    const renderToast = () => {
      if (!waitingWorker || toastClosed || disposed) return;
      const pending = getActiveStreamCount();
      toast("Update ready, tap to refresh", {
        id: UPDATE_TOAST_ID,
        description: pending > 0
          ? `Waiting for ${pending} stream${pending > 1 ? "s" : ""} to finish before applying the update.`
          : "Reload the page to get the latest version",
        action: {
          label: "Refresh",
          onClick: () => {
            if (pending > 0) {
              // Feedback rather than a silent no-op: an update held back for a
              // stream can look like a broken button without this.
              renderToast();
              return;
            }
            applyUpdate();
          },
        },
        duration: Infinity,
        onDismiss: stopWatchingStreams,
      });
      if (!unsubscribeStreams) unsubscribeStreams = subscribeActiveStreams(renderToast);
    };

    const applyUpdate = () => {
      const worker = waitingWorker;
      if (!worker || disposed) return;
      stopWatchingStreams();
      toast.dismiss(UPDATE_TOAST_ID);
      worker.postMessage({ type: "skip-waiting" });
      worker.addEventListener("statechange", () => {
        if (worker.state === "activated") window.location.reload();
      });
    };

    const trackWaiting = (worker: ServiceWorker) => {
      waitingWorker = worker;
      renderToast();
    };

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        if (disposed) return;

        // A worker that installed before this tab opened is still waiting for us.
        if (registration.waiting) trackWaiting(registration.waiting);

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          const onStateChange = () => {
            if (disposed || toastClosed) return;
            // `controller` is non-null only when an older worker still holds the
            // page, which is what makes a newly installed worker "waiting".
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              trackWaiting(newWorker);
            }
          };
          newWorker.addEventListener("statechange", onStateChange);
          onStateChange();
        });

        // The browser only re-checks on navigation, so an update published while this
        // tab stayed open would otherwise never be noticed.
        await registration.update().catch(() => undefined);
      } catch (err) {
        console.warn("[PWA] service worker registration failed", err);
      }
    };

    if (document.readyState === "complete") {
      void registerSW();
    } else {
      window.addEventListener("load", registerSW, { once: true });
    }

    return () => {
      disposed = true;
      stopWatchingStreams();
    };
  }, []);
}
