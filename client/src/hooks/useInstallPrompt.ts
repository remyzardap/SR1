import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  InstallPromptController,
  type InstallPromptState,
  type InstallPromptWindow,
} from "@/lib/installPrompt";

export type { BeforeInstallPromptEvent } from "@/lib/installPrompt";

export type UseInstallPromptResult = InstallPromptState & {
  /** Opens the browser's native install dialog. Resolves with the user's choice. */
  install: () => Promise<boolean>;
  /** Closes the card and suppresses it for the next 14 days. */
  dismiss: () => void;
  /** Closes the one-time iOS hint. */
  dismissIosHint: () => void;
};

/**
 * React binding over `InstallPromptController`
 * (`client/src/lib/installPrompt.ts`), which owns the rules: which affordance is
 * on screen, holding the `beforeinstallprompt` event, the 14-day dismissal and
 * the once-only iOS hint. Nothing is decided here, which keeps the behaviour
 * testable without needing a DOM to render a hook.
 */
export function useInstallPrompt(): UseInstallPromptResult {
  // One controller per tab: keeping it in state means a re-render never
  // re-registers the browser listeners.
  const [controller] = useState(
    () =>
      new InstallPromptController(
        typeof window === "undefined" ? null : (window as unknown as InstallPromptWindow)
      )
  );

  useEffect(() => controller.attach(), [controller]);

  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState
  );

  const install = useCallback(() => controller.install(), [controller]);
  const dismiss = useCallback(() => controller.dismiss(), [controller]);
  const dismissIosHint = useCallback(() => controller.dismissIosHint(), [controller]);

  return { ...state, install, dismiss, dismissIosHint };
}
