import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  FIRST_RUN_CARDS,
  FIRST_RUN_DISMISS_LABEL,
  FIRST_RUN_TITLE,
  markFirstRunSeen,
  shouldShowFirstRun,
} from "@/lib/firstRun";
import { FirstRun } from "@/components/redo/FirstRun";

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

  return <FirstRun onDismiss={() => setOpen(false)} />;
}

export default FirstRunScreen;