import { useEffect, useState } from "react";

/**
 * Tracks a CSS media query. The prototype switches its docked composer rules at
 * 760px (`isPhone()` in design/sutaeru-app/app.js), which is not the same break
 * as `useIsMobile()` (1024px), so screens that follow the prototype's layout use
 * this instead.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? fallback : window.matchMedia(query).matches
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
