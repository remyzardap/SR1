import { useEffect, useState, useCallback } from "react";

const DISMISSAL_KEY = "sutaeru.install-dismissed";
const DISMISSAL_DAYS = 14;

function isDismissed(): boolean {
  try {
    const stored = localStorage.getItem(DISMISSAL_KEY);
    if (!stored) return false;
    const { timestamp } = JSON.parse(stored);
    const ageDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
    return ageDays < DISMISSAL_DAYS;
  } catch {
    return false;
  }
}

function setDismissed() {
  try {
    localStorage.setItem(DISMISSAL_KEY, JSON.stringify({ timestamp: Date.now() }));
  } catch {
    // storage may be unavailable
  }
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true;
}

/**
 * Hook for managing the PWA install prompt.
 * - Captures beforeinstallprompt event
 * - Shows install button when installable and not already installed
 * - Remembers dismissal for 14 days
 * - Shows iOS Safari hint once
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [iosHintDismissed, setIosHintDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Don't show if already installed
    if (isStandalone()) return;

    // Check if install prompt was dismissed recently
    if (isDismissed()) return;

    // Check for iOS Safari (no beforeinstallprompt event)
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isIos && isSafari) {
      const iosHintKey = "sutaeru.ios-hint-shown";
      if (!localStorage.getItem(iosHintKey)) {
        setShowIosHint(true);
        localStorage.setItem(iosHintKey, "true");
      }
      return;
    }

    // Listen for beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setDismissed();
    }
    return outcome === "accepted";
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setDeferredPrompt(null);
    setDismissed();
  }, []);

  const dismissIosHint = useCallback(() => {
    setShowIosHint(false);
    setIosHintDismissed(true);
  }, []);

  return {
    canInstall: !!deferredPrompt,
    isStandalone: isStandalone(),
    showIosHint: showIosHint && !iosHintDismissed,
    install,
    dismiss,
    dismissIosHint,
  };
}

// Type for beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}