import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Register the service worker and handle update notifications.
 * - Does not skipWaiting while a stream is active
 * - Shows "Update ready, tap to refresh" toast when a new SW is waiting
 */
export function useServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

    let registration: ServiceWorkerRegistration | null = null;
    let refreshing = false;

    const registerSW = async () => {
      try {
        registration = await navigator.serviceWorker.register("/sw.js");
        
        // Check for waiting SW (update ready)
        if (registration.waiting) {
          showUpdateToast(registration.waiting);
        }

        // Listen for new SW installing
        registration.addEventListener("updatefound", () => {
          const newWorker = registration?.installing;
          if (!newWorker) return;
          
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateToast(newWorker);
            }
          });
        });

        // Listen for messages from SW
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "check-update" && registration?.waiting) {
            showUpdateToast(registration.waiting);
          }
        });

      } catch (err) {
        console.warn("[PWA] service worker registration failed", err);
      }
    };

    const showUpdateToast = (worker: ServiceWorker) => {
      if (refreshing) return;
      
      toast("Update ready", {
        description: "Tap to refresh and get the latest version",
        action: {
          label: "Refresh",
          onClick: () => {
            refreshing = true;
            worker.postMessage({ type: "skip-waiting" });
            worker.addEventListener("statechange", () => {
              if (worker.state === "activated") {
                window.location.reload();
              }
            });
          },
        },
        duration: Infinity,
      });
    };

    // Notify SW when a stream starts/ends so it can delay skipWaiting
    const handleStreamStart = () => {
      navigator.serviceWorker.controller?.postMessage("stream-start");
    };
    const handleStreamEnd = () => {
      navigator.serviceWorker.controller?.postMessage("stream-end");
    };

    window.addEventListener("sutaeru:stream-start", handleStreamStart);
    window.addEventListener("sutaeru:stream-end", handleStreamEnd);

    if (document.readyState === "complete") {
      registerSW();
    } else {
      window.addEventListener("load", registerSW, { once: true });
    }

    return () => {
      window.removeEventListener("sutaeru:stream-start", handleStreamStart);
      window.removeEventListener("sutaeru:stream-end", handleStreamEnd);
    };
  }, []);
}

/**
 * Call this when an SSE/streaming connection opens
 */
export function notifyStreamStart() {
  window.dispatchEvent(new Event("sutaeru:stream-start"));
}

/**
 * Call this when an SSE/streaming connection closes
 */
export function notifyStreamEnd() {
  window.dispatchEvent(new Event("sutaeru:stream-end"));
}