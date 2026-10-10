import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { FoldGroup, FoldSection, Pic, useFoldState } from "@/components/fold";
import { SutaeruGlyph } from "@/components/SutaeruGlyph";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { cn } from "@/lib/utils";

/* The logo menu, presentational: a spacious sheet on phones, a popover from 760 px up.
   It is the one navigation surface (there is no bottom bar): picture tiles for the
   workspace, then "Working for you", "Recent chats" and "Yours" as fold sections,
   one open at a time on phones. The container (NavLogoMenu) owns the data, the
   trigger and the navigation; everything here is props in, callbacks out. */

export interface MenuTile {
  label: string;
  href: string;
  /** Picture from /studio/o/ via lib/pickArt. */
  art: string;
  active: boolean;
}

export interface MenuRun {
  id: string;
  label: string;
  detail: string;
  href: string;
  /** Pulsing dot: the task is working right now. */
  live: boolean;
}

export interface MenuChat {
  id: string;
  title: string;
  when: string;
  href: string;
}

export interface MenuPill {
  label: string;
  href: string;
  active: boolean;
}

export interface MenuPerson {
  name: string;
  initial: string;
  meta?: string;
  /** Plan and usage line, e.g. "free plan · 38 of 50 messages". */
  plan?: string;
  /** Ten-dot usage meter: `used` of `of`. */
  meter?: { used: number; of: number } | null;
}

export interface LogoMenuSheetProps {
  open: boolean;
  /** True while the exit animation plays; the surface stays mounted until it ends. */
  closing: boolean;
  mode: "sheet" | "popover";
  /** Popover origin (the logo button); ignored in sheet mode. */
  anchor?: { top: number; left: number } | null;
  tiles: MenuTile[];
  runs: MenuRun[];
  chats: MenuChat[];
  pills: MenuPill[];
  person: MenuPerson | null;
  onNavigate: (href: string) => void;
  onNewChat: () => void;
  onPastChats: () => void;
  onClose: () => void;
}

const FOLD_IDS = ["runs", "recent", "yours"];

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
  ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
}

export function LogoMenuSheet({
  open,
  closing,
  mode,
  anchor,
  tiles,
  runs,
  chats,
  pills,
  person,
  onNavigate,
  onNewChat,
  onPastChats,
  onClose,
}: LogoMenuSheetProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [settled, setSettled] = useState(false);
  const fold = useFoldState("menu", FOLD_IDS, { first: "recent" });

  /* Once the enter animation has played, drop it: a finished transform animation keeps the
     surface on its own compositor layer, and Chromium then leaves the scroll body's
     off-screen rows unpainted until the next scroll. */
  useEffect(() => {
    if (open) setSettled(false);
  }, [open]);

  /* Which edges of the scroll body still have content behind them. */
  const [fade, setFade] = useState({ top: false, bottom: false });
  const measure = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const top = el.scrollTop > 4;
    const bottom = el.scrollHeight - el.clientHeight - el.scrollTop > 4;
    setFade((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);
  const bodyRef = useCallback(
    (el: HTMLDivElement | null) => {
      measure(el);
    },
    [measure]
  );
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => measure(surfaceRef.current?.querySelector(".lm-body") ?? null), 80);
    return () => window.clearTimeout(t);
  }, [open, measure, runs.length, chats.length, pills.length, fold.open]);

  /* Focus moves in when the surface appears and the Tab key stays inside it. */
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => closeRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !surfaceRef.current) return;
      const items = focusables(surfaceRef.current);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  /* The page behind holds still while the menu is up. */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open && !closing) return null;

  const runsPick =
    runs.length > 0 ? (
      <span className="lm-pick">
        {runs.length} running
        <span className="lm-live">
          <i className="pulse" />
          Live
        </span>
      </span>
    ) : (
      "All quiet"
    );

  return (
    <>
      <div className="lm-scrim" data-closing={closing ? "true" : "false"} onClick={onClose} aria-hidden="true" />
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        data-closing={closing ? "true" : "false"}
        className={cn("lm-surface", mode === "sheet" ? "lm-sheet" : "lm-pop", settled && "lm-settled")}
        style={mode === "popover" && anchor ? { top: anchor.top, left: anchor.left } : undefined}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget && !closing) setSettled(true);
        }}
      >
        <div className="lm-grab" aria-hidden="true" />
        <div className="lm-head">
          <span className="lm-brand">
            <SutaeruGlyph className="lm-glyph" />
            <b>Sutaeru</b>
          </span>
          <button ref={closeRef} type="button" className="icon-btn flat lm-close" onClick={onClose} aria-label="Close menu" title="Close menu">
            <SutaeruIcon name="close" signal={false} width={20} height={20} />
          </button>
        </div>

        <div
          ref={bodyRef}
          className="lm-body"
          data-fade-top={fade.top ? "true" : "false"}
          data-fade-bottom={fade.bottom ? "true" : "false"}
          onScroll={(e) => measure(e.currentTarget)}
        >
          <div className="lm-actions">
            <button type="button" className="btn ink" onClick={onNewChat}>
              <SutaeruIcon name="plus" signal={false} width={18} height={18} />
              New chat
            </button>
            <button type="button" className="btn" onClick={onPastChats}>
              <SutaeruIcon name="bookmark" signal={false} width={18} height={18} />
              Past chats
            </button>
          </div>

          <div className="lm-ws">
            <span className="mono">Workspace</span>
            <div className="lm-grid">
              {tiles.map((t) => (
                <button
                  key={t.href}
                  type="button"
                  className="lm-tile"
                  aria-current={t.active ? "page" : undefined}
                  onClick={() => onNavigate(t.href)}
                >
                  <span className="lm-tile-pic">
                    <Pic art={t.art} eager />
                  </span>
                  <b>
                    {t.label}
                    {t.active && <i aria-hidden="true" />}
                  </b>
                </button>
              ))}
            </div>
          </div>

          <div className="lm-secs">
            <FoldGroup state={fold}>
              <FoldSection id="runs" label="Working for you" pick={runsPick}>
                {runs.length > 0 ? (
                  <div className="lm-rows">
                    {runs.map((r) => (
                      <button key={r.id} type="button" className="lm-row" onClick={() => onNavigate(r.href)}>
                        <span className={cn("live-dot", r.live && "pulse")} aria-hidden="true" />
                        <span className="lm-row-t">
                          <b>{r.label}</b>
                          <small>{r.detail}</small>
                        </span>
                        <SutaeruIcon name="arrow" signal={false} width={18} height={18} className="lm-row-arrow" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="lm-empty">Nothing is running. Tasks you start keep working here.</p>
                )}
              </FoldSection>

              <FoldSection id="recent" label="Recent chats" pick={chats.length > 0 ? chats[0].title : undefined}>
                {chats.length > 0 ? (
                  <div className="lm-rows">
                    {chats.map((c) => (
                      <button key={c.id} type="button" className="lm-row" onClick={() => onNavigate(c.href)}>
                        <span className="lm-row-t">
                          <b>{c.title}</b>
                        </span>
                        <span className="lm-when">{c.when}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="lm-empty">No chats yet. Your past chats live here, only here.</p>
                )}
              </FoldSection>

              <FoldSection id="yours" label="Yours">
                <div className="lm-pills">
                  {pills.map((p) => (
                    <button
                      key={p.href}
                      type="button"
                      className={cn("pill", p.active && "on")}
                      aria-current={p.active ? "page" : undefined}
                      onClick={() => onNavigate(p.href)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </FoldSection>
            </FoldGroup>
          </div>
        </div>

        {person && (
          <div className="lm-foot">
            <span className="lm-avatar" aria-hidden="true">
              {person.initial}
            </span>
            <span className="lm-who">
              <b>{person.name}</b>
              {(person.plan || person.meta) && (
                <span className="mono">{[person.plan, person.meta].filter(Boolean).join(" · ")}</span>
              )}
            </span>
            {person.meter && person.meter.of > 0 && (
              <span className="lm-dots" aria-hidden="true">
                {Array.from({ length: 10 }, (_, i) => (
                  <i key={i} className={i < Math.round((person.meter!.used / person.meter!.of) * 10) ? "on" : undefined} />
                ))}
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default LogoMenuSheet;
