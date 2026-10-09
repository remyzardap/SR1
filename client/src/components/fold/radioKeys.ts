import type { KeyboardEvent } from "react";

/* Radiogroup keyboard pattern shared by PickTiles and Showcase: one tab stop (the picked item),
   arrow keys, Home and End move the pick and focus, and the newly picked item scrolls into view. */

export function rovingIndex(ids: string[], value: string | null | undefined, id: string): 0 | -1 {
  const current = value && ids.includes(value) ? value : ids[0];
  return id === current ? 0 : -1;
}

export function radioKeyDown(ids: string[], value: string | null | undefined, onChange: (id: string) => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    const at = Math.max(0, value ? ids.indexOf(value) : 0);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (at + 1) % ids.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (at - 1 + ids.length) % ids.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = ids.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(ids[next]);
    const el = e.currentTarget.querySelector<HTMLElement>(`[data-id="${CSS.escape(ids[next])}"]`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
}
