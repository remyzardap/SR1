import * as React from "react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { FocusBrackets } from "@/components/art/FocusBrackets";
import { cn } from "@/lib/utils";
import { Pic, type Art } from "./Pic";
import { Tick } from "./PickTiles";
import { radioKeyDown, rovingIndex } from "./radioKeys";

export interface ShowcaseItem {
  id: string;
  /** Name on the card, Inter Tight 800. Keep it to a word or two: the picture explains the rest. */
  name: string;
  /** A real image url (or a drawn node). */
  art: Art;
  /** Small mono line over the picture, e.g. "Suggested". */
  badge?: ReactNode;
  /** Accessible description when the name alone is not enough. */
  description?: string;
}

export interface ShowcaseProps {
  items: ShowcaseItem[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name of the radiogroup. */
  label: string;
  /** "sm" is a 230x172 card for secondary sets. */
  size?: "md" | "sm";
  className?: string;
}

function Card({ item, on, tabIndex, onPick, className }: { item: ShowcaseItem; on: boolean; tabIndex: 0 | -1; onPick: () => void; className?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={item.description ? `${item.name}. ${item.description}` : item.name}
      tabIndex={tabIndex}
      data-id={item.id}
      className={cn("sc", on && "on", className)}
      onClick={onPick}
    >
      <span className="sc-pic">
        <Pic art={item.art} fallback={<span className="sc-blank" />} />
      </span>
      {item.badge ? <span className="sc-badge">{item.badge}</span> : null}
      <span className="nm">{item.name}</span>
      <Tick />
      {on && <FocusBrackets />}
    </button>
  );
}

/**
 * Exactly two options: two cards side by side, nothing hidden off screen.
 */
export function TwoUp({ items, value, onChange, label, className }: Omit<ShowcaseProps, "size">) {
  const ids = items.map((i) => i.id);
  return (
    <div className={cn("duo-sc", className)} role="radiogroup" aria-label={label} onKeyDown={radioKeyDown(ids, value, onChange)}>
      {items.map((it) => (
        <Card key={it.id} item={it} on={value === it.id} tabIndex={rovingIndex(ids, value, it.id)} onPick={() => onChange(it.id)} />
      ))}
    </div>
  );
}

/**
 * ONE big picture card at a time in a sideways scroll-snap carousel, with a peek of the next card
 * and a pager. Tapping a card picks it; swiping only browses. Two items fall back to TwoUp.
 */
export function Showcase({ items, value, onChange, label, size = "md", className }: ShowcaseProps) {
  const track = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(() => Math.max(0, items.findIndex((i) => i.id === value)));
  const ids = items.map((i) => i.id);

  /* Start on the picked card, without animating. */
  useEffect(() => {
    const el = track.current;
    const at = items.findIndex((i) => i.id === value);
    if (!el || at <= 0) return;
    const card = el.children[at] as HTMLElement | undefined;
    if (card) el.scrollLeft = card.offsetLeft - el.offsetLeft - parseFloat(getComputedStyle(el).scrollPaddingLeft || "0");
    /* Only on mount: later picks come from taps on cards already in view. */
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const first = el.children[0] as HTMLElement | undefined;
        const second = el.children[1] as HTMLElement | undefined;
        if (!first) return;
        const step = second ? second.offsetLeft - first.offsetLeft : first.offsetWidth;
        const max = el.scrollWidth - el.clientWidth;
        /* At the far end the last card may never reach the snap point: count it as shown. */
        const next = el.scrollLeft >= max - 2 ? items.length - 1 : Math.round(el.scrollLeft / Math.max(1, step));
        setPage((cur) => (cur === next ? cur : Math.min(items.length - 1, Math.max(0, next))));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [items.length]);

  if (items.length === 2) return <TwoUp items={items} value={value} onChange={onChange} label={label} className={className} />;

  return (
    <div className={cn("show-wrap", size === "sm" && "is-sm", className)}>
      <div ref={track} className="show" role="radiogroup" aria-label={label} onKeyDown={radioKeyDown(ids, value, onChange)}>
        {items.map((it) => (
          <Card key={it.id} item={it} on={value === it.id} tabIndex={rovingIndex(ids, value, it.id)} onPick={() => onChange(it.id)} className={size === "sm" ? "sm" : undefined} />
        ))}
      </div>
      {items.length > 1 && (
        <div className="pager" aria-hidden="true">
          {items.map((it, i) => (
            <i key={it.id} className={i === page ? "on" : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}
