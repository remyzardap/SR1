import { useEffect, useState } from "react";

import { LandingMark } from "@/components/LandingMark";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  FIRST_RUN_CARDS,
  FIRST_RUN_DISMISS_LABEL,
  FIRST_RUN_TITLE,
  markFirstRunSeen,
  shouldShowFirstRun,
} from "@/lib/firstRun";

import "@/styles/first-run.css";

/**
 * First-run greeting: one card, three plain promises, one big button — shown once
 * per browser after a person's very first sign-in (T-74 / F-12).
 *
 * Mounted above the router in `App`, because a new person can land anywhere after
 * signing in. The flag is written as the card appears rather than when the button is
 * pressed: the promise is "once", so someone who closes the tab mid-read is not
 * interrupted again on the next visit.
 */
export function FirstRunScreen() {
  const { isAuthenticated, loading } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !isAuthenticated) return;
    if (!shouldShowFirstRun()) return;
    markFirstRunSeen();
    setOpen(true);
  }, [isAuthenticated, loading]);

  if (!open) return null;

  return (
    <div
      className="sr-first-run"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sr-first-run-title"
    >
      <section className="sr-first-run-card">
        <LandingMark className="sr-first-run-mark" detail="compact" />
        <h1 id="sr-first-run-title" className="sr-first-run-title">
          {FIRST_RUN_TITLE}
        </h1>
        <ul className="sr-first-run-list">
          {FIRST_RUN_CARDS.map((line) => (
            <li key={line} className="sr-first-run-item">
              {line}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="sr-first-run-done"
          data-testid="button-first-run-done"
          autoFocus
          onClick={() => setOpen(false)}
        >
          {FIRST_RUN_DISMISS_LABEL}
        </button>
      </section>
    </div>
  );
}

export default FirstRunScreen;
