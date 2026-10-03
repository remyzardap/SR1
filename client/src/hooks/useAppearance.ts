import { useEffect, useState } from "react";
import { currentMode, onAppearanceChange } from "@/lib/theme";

/**
 * The palette actually on screen ("light" | "dark"), following the saved choice and,
 * for System, the OS preference. Components that pick a different art variant per
 * theme (the chat running card, for example) read it here.
 */
export function useThemeMode(): "light" | "dark" {
  const [mode, setMode] = useState<"light" | "dark">(() => (typeof window === "undefined" ? "light" : currentMode()));
  useEffect(() => {
    const sync = () => setMode(currentMode());
    sync();
    return onAppearanceChange(sync);
  }, []);
  return mode;
}

/** navigator.onLine, kept current through the online/offline events. */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() => (typeof window === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}
