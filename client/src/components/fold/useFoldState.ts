import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* Fold state for a page of FoldSections.
   Phones (<760 px) keep one section open at a time, tablets may open several, and from 1100 px
   every section starts open. What the person last chose is remembered per page and per layout,
   so a phone's folds never close the desktop's. Storage is optional: private mode, quota and
   bad JSON all fall back to the defaults. */

export type FoldLayout = "phone" | "tablet" | "desktop";

export const PHONE_MAX = 760;
export const DESKTOP_MIN = 1100;

export function layoutFor(width: number): FoldLayout {
  if (width < PHONE_MAX) return "phone";
  if (width < DESKTOP_MIN) return "tablet";
  return "desktop";
}

export const foldKey = (pageKey: string) => `sutaeru:fold:${pageKey}`;

type Stored = Partial<Record<FoldLayout, string[]>>;

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The open ids saved for this page and layout, or null when nothing usable is stored. */
export function readFold(pageKey: string, layout: FoldLayout, storage: Storage | null = safeStorage()): string[] | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(foldKey(pageKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    const ids = parsed && typeof parsed === "object" ? parsed[layout] : undefined;
    return Array.isArray(ids) && ids.every((x) => typeof x === "string") ? ids : null;
  } catch {
    return null;
  }
}

export function writeFold(pageKey: string, layout: FoldLayout, open: string[], storage: Storage | null = safeStorage()): void {
  if (!storage) return;
  try {
    let all: Stored = {};
    try {
      const raw = storage.getItem(foldKey(pageKey));
      const parsed = raw ? (JSON.parse(raw) as Stored) : null;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) all = parsed;
    } catch {
      /* A broken entry is replaced. */
    }
    storage.setItem(foldKey(pageKey), JSON.stringify({ ...all, [layout]: open }));
  } catch {
    /* Quota or private mode: folds still work, they are just not remembered. */
  }
}

export interface FoldDefaults {
  /** The section that still needs input; it starts open on phones and tablets. Defaults to the first id. */
  first?: string;
  /** Extra sections open by default on tablets. */
  tabletOpen?: string[];
}

/** Which sections are open when the page loads. */
export function initialOpen(ids: string[], layout: FoldLayout, stored: string[] | null, defaults: FoldDefaults = {}): string[] {
  if (stored) {
    const known = stored.filter((id) => ids.includes(id));
    return layout === "phone" ? known.slice(0, 1) : known;
  }
  if (layout === "desktop") return [...ids];
  const first = defaults.first && ids.includes(defaults.first) ? defaults.first : ids[0];
  if (first === undefined) return [];
  if (layout === "phone") return [first];
  return Array.from(new Set([first, ...(defaults.tabletOpen ?? []).filter((id) => ids.includes(id))]));
}

/** Open or close one section. On phones opening one closes the others. */
export function setSection(open: string[], id: string, next: boolean, layout: FoldLayout): string[] {
  if (!next) return open.filter((x) => x !== id);
  if (layout === "phone") return [id];
  return open.includes(id) ? open : [...open, id];
}

export interface FoldState {
  layout: FoldLayout;
  ids: string[];
  open: string[];
  isOpen: (id: string) => boolean;
  setOpen: (id: string, next: boolean) => void;
  toggle: (id: string) => void;
  foldAll: () => void;
  openAll: () => void;
  /** True when no section is open: the head pill then offers "Open all". */
  allFolded: boolean;
}

function currentLayout(): FoldLayout {
  return typeof window === "undefined" ? "phone" : layoutFor(window.innerWidth);
}

/**
 * Fold state for one page. `ids` are the page's sections in order.
 * Opening all on a phone is honoured (the person asked for it); the next single open folds the rest again.
 */
export function useFoldState(pageKey: string, ids: string[], defaults: FoldDefaults = {}): FoldState {
  const idsKey = ids.join("|");
  /* Callers usually pass a fresh array each render; the order of ids is what matters. */
  const stableIds = useMemo(() => idsKey.split("|").filter(Boolean), [idsKey]);
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  const [layout, setLayout] = useState<FoldLayout>(currentLayout);
  const layoutRef = useRef(layout);
  const [open, setOpenIds] = useState<string[]>(() => initialOpen(stableIds, layout, readFold(pageKey, layout), defaults));

  /* Crossing a breakpoint loads that layout's own folds. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      const next = currentLayout();
      if (next === layoutRef.current) return;
      layoutRef.current = next;
      setLayout(next);
      setOpenIds(initialOpen(stableIds, next, readFold(pageKey, next), defaultsRef.current));
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, [pageKey, stableIds]);

  const commit = useCallback(
    (next: string[]) => {
      setOpenIds(next);
      writeFold(pageKey, layout, next);
    },
    [pageKey, layout],
  );

  const setOpen = useCallback((id: string, next: boolean) => commit(setSection(open, id, next, layout)), [commit, open, layout]);
  const toggle = useCallback((id: string) => setOpen(id, !open.includes(id)), [setOpen, open]);
  const foldAll = useCallback(() => commit([]), [commit]);
  const openAll = useCallback(() => commit([...stableIds]), [commit, stableIds]);
  const isOpen = useCallback((id: string) => open.includes(id), [open]);

  return { layout, ids: stableIds, open, isOpen, setOpen, toggle, foldAll, openAll, allFolded: open.length === 0 };
}
