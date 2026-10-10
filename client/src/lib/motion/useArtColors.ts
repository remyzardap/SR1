import { useEffect, useRef, useState, type RefObject } from "react";
import { onAppearanceChange } from "@/lib/theme";
import { cssColor, type RGB } from "./color";

export interface ArtColors {
  ink: RGB;
  accent: RGB;
  paper: RGB;
  dark: boolean;
}

const FALLBACK: ArtColors = { ink: [26, 26, 26], accent: [244, 81, 30], paper: [247, 246, 242], dark: false };

function read(el: Element | null): ArtColors {
  if (!el) return FALLBACK;
  const ink = cssColor(el, "color", FALLBACK.ink);
  const accent = cssColor(el, "--r-accent", FALLBACK.accent);
  const paper = cssColor(el, "--r-paper", FALLBACK.paper);
  const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return { ink, accent, paper, dark: lum(paper) < lum(ink) };
}

/**
 * Colours for canvas art, read from the element's `color` and the theme tokens, kept fresh across
 * theme switches (the app's appearance event, the OS scheme and data-theme changes on <html>).
 * Returns a ref for per-frame reads and a version number that changes with the colours.
 */
export function useArtColors(ref: RefObject<Element | null>): { colors: RefObject<ArtColors>; version: number } {
  const colors = useRef<ArtColors>(FALLBACK);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => {
      // Wait a frame so the new theme's styles are applied before reading them.
      requestAnimationFrame(() => {
        colors.current = read(ref.current);
        setVersion((v) => v + 1);
      });
    };
    colors.current = read(ref.current);
    setVersion((v) => v + 1);
    const off = onAppearanceChange(refresh);
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(refresh) : null;
    mo?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-mode", "class", "style"] });
    return () => {
      off();
      mo?.disconnect();
    };
  }, [ref]);
  return { colors, version };
}
