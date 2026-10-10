/**
 * The list-page pattern of the Studio standard (docs/spec/STUDIO-STANDARD.md, Step 4).
 *
 * One vocabulary for every page that is mostly a list — Connections, Skills, Memories,
 * Monitors, Identity, Invites, Audit logs, More and Admin: a head with the Fold all pill,
 * an optional search line, an optional stats strip, then folding sections of rows.
 *
 * Presentational only: rows come in as props or children, every handler is a prop, and the
 * fold state is handed down by the container from `useFoldState`. Nothing here fetches.
 */

import * as React from "react";
import { useEffect, useRef, type ReactNode } from "react";

import { SutaeruIcon, type SutaeruIconName } from "@/components/SutaeruIcon";
import { SteppedMeter } from "@/components/art";
import {
  FoldAllButton,
  FoldGroup,
  FoldSection,
  Pic,
  type Art,
  type FoldDefaults,
  type FoldState,
} from "@/components/fold";
import { useFoldState } from "@/components/fold";
import { cn } from "@/lib/utils";

/* ── Fold state ─────────────────────────────────────────────────────────────── */

/** Fold state for one list page: ids are the sections in page order. */
export function useListFolds(pageKey: string, ids: string[], defaults: FoldDefaults = {}): FoldState {
  return useFoldState(pageKey, ids, defaults);
}

/**
 * Keeps a section open while it needs an answer (an open form, a two-factor code).
 * The container calls this instead of forcing `open`, so the accordion stays honest.
 */
export function useAutoOpen(fold: FoldState, id: string, active: boolean): void {
  const was = useRef(false);
  const setOpen = fold.setOpen;
  useEffect(() => {
    if (active && !was.current) setOpen(id, true);
    was.current = active;
  }, [active, id, setOpen]);
}

/* ── Page head ──────────────────────────────────────────────────────────────── */

export interface ListPageProps {
  title: ReactNode;
  /** One sentence, at most. Dropped on phones when the picture or the rows say it. */
  lede?: ReactNode;
  actions?: ReactNode;
  /** Fold state of the page; drives the Fold all pill and every section inside. */
  fold: FoldState;
  /** Two columns and a wider measure at desktop (tables, admin). */
  wide?: boolean;
  className?: string;
  children: ReactNode;
}

/** The page frame: `view` gutter, title, lede, actions, Fold all. */
export function ListPage({ title, lede, actions, fold, wide = false, className, children }: ListPageProps) {
  return (
    <section className={cn("view view-enter lst-page", wide && "wide", className)}>
      <header className="head-row lst-head">
        <div>
          <h1 className="title lst-title">{title}</h1>
          {lede ? <p className="lede lst-lede">{lede}</p> : null}
        </div>
        <div className="lst-actions">
          {actions}
          <FoldAllButton state={fold} />
        </div>
      </header>
      {children}
    </section>
  );
}

/* ── Search ─────────────────────────────────────────────────────────────────── */

export interface SearchBarProps {
  value: string;
  onChange(next: string): void;
  label: string;
  placeholder?: string;
  /** "12 / 40" in mono at the end of the line. */
  count?: ReactNode;
  /** Extra controls on the same line (a sort button). */
  extra?: ReactNode;
  className?: string;
}

export function SearchBar({ value, onChange, label, placeholder = "Search", count, extra, className }: SearchBarProps) {
  return (
    <div className={cn("lst-tools", className)}>
      <div className="lst-search">
        <svg className="fi" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={value}
          aria-label={label}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        {value ? (
          <button type="button" className="lst-x" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => onChange("")}>
            <svg className="fi" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        ) : null}
      </div>
      {count ? <span className="mono lst-count">{count}</span> : null}
      {extra}
    </div>
  );
}

/* ── Stats strip ────────────────────────────────────────────────────────────── */

export interface StripItem {
  label: string;
  value: ReactNode;
  /** 0..1: the strip draws a ten-dot meter under the number. */
  meter?: number;
  /** Accessible description of the meter, e.g. "12 of 40 profiles set up". */
  meterLabel?: string;
}

/** One card of four numbers instead of four tall cards. */
export function StatStrip({ items, className }: { items: StripItem[]; className?: string }) {
  return (
    <div className={cn("lst-strip", className)}>
      {items.map((item) => (
        <div className="lst-stat" key={item.label}>
          <span className="mono">{item.label}</span>
          <span className={cn("lst-num", typeof item.value === "string" && item.value.length > 6 && "sm")}>{item.value}</span>
          {item.meter !== undefined && (
            <SteppedMeter value={item.meter} segments={10} ariaLabel={item.meterLabel ?? `${item.label}: ${item.value}`} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Rows ───────────────────────────────────────────────────────────────────── */

export interface RowProps {
  /** The whole name. A row that goes somewhere passes `<Link href>` here, never a bare `a`. */
  title: ReactNode;
  /** Mono line: "type · size · date". */
  meta?: ReactNode;
  /** Quiet body line (a description, a one-sentence read-out). */
  body?: ReactNode;
  /** Keep the title on one line with an ellipsis. */
  truncate?: boolean;
  /** Picture url or drawn node at the left. */
  art?: Art;
  /** Initials in a round tile (people). */
  initials?: string;
  /** One icon in a tile (things with no picture yet). */
  icon?: SutaeruIconName;
  status?: ReactNode;
  /** Buttons at the right. */
  actions?: ReactNode;
  /** A row that goes somewhere: the chevron at the far right. */
  chevron?: boolean;
  /** Dimmed: revoked, paused, off. */
  quiet?: boolean;
  className?: string;
  /** Extra content under the row line (a report, a form, sub-rows). */
  children?: ReactNode;
}

/** What makes a row a row: a tile, the whole name, a mono line, the status, the actions. */
export function Row({ title, meta, body, truncate, art, initials, icon, status, actions, chevron, quiet, className, children }: RowProps) {
  const hasPic = art !== undefined && art !== null;
  const round = !hasPic && Boolean(initials || icon);
  return (
    <li className={cn("lst-row", quiet && "quiet", className)}>
      {hasPic || round ? (
        <span className={cn("lst-art", round && "round")} aria-hidden="true">
          {hasPic ? <Pic art={art} /> : null}
          {!hasPic && initials ? <span className="lst-ini">{initials}</span> : null}
          {!hasPic && !initials && icon ? <SutaeruIcon name={icon} signal={false} /> : null}
        </span>
      ) : null}
      <div className="lst-main">
        <p className={cn("lst-name", truncate && "one")}>{title}</p>
        {body ? <p className={cn("lst-body", children ? undefined : "clamp")}>{body}</p> : null}
        {meta ? <p className="mono lst-meta">{meta}</p> : null}
      </div>
      {status || actions || chevron ? (
        <div className="lst-side">
          {status}
          {actions}
          {chevron ? (
            <span className="lst-go" aria-hidden="true">
              <svg className="fi" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </span>
          ) : null}
        </div>
      ) : null}
      {children ? <div className="lst-more">{children}</div> : null}
    </li>
  );
}

/** The list itself: a semantic ul of rows, no card around it — the fold is the container. */
export function Rows({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <ul className={cn("lst-rows", className)} aria-label={label}>
      {children}
    </ul>
  );
}

/* ── Sections ───────────────────────────────────────────────────────────────── */

export interface ListFoldProps {
  id: string;
  label: string;
  index?: number;
  /** The current pick or count in words, shown while folded. */
  pick?: ReactNode;
  mini?: Art;
  fold: FoldState;
  className?: string;
  children: ReactNode;
}

/** A FoldSection wired to the page's fold state. */
export function ListFold({ id, label, index, pick, mini, fold, className, children }: ListFoldProps) {
  return (
    <FoldSection id={id} label={label} index={index} pick={pick} mini={mini} className={className} open={fold.isOpen(id)} onOpenChange={(next) => fold.setOpen(id, next)}>
      {children}
    </FoldSection>
  );
}

/** The sections of a page, in the page's fold group. */
export function ListFolds({ fold, className, children }: { fold: FoldState; className?: string; children: ReactNode }) {
  return (
    <FoldGroup state={fold} className={cn("lst-folds", className)}>
      {children}
    </FoldGroup>
  );
}

/** Rows that are not a fold (a card that must stay on screen, the open form). */
export function PlainSection({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("lst-plain", className)}>
      {label ? <p className="mono" style={{ margin: "0 0 8px" }}>{label}</p> : null}
      {children}
    </section>
  );
}

/* ── States ─────────────────────────────────────────────────────────────────── */

export function RowsSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <ul className={cn("lst-rows", className)} aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <li className="lst-row" key={i}>
          <span className="lst-art" aria-hidden="true">
            <span className="lst-skeleton" style={{ width: "100%", height: "100%", borderRadius: 10 }} />
          </span>
          <div className="lst-main">
            <span className="lst-skeleton" style={{ width: "56%", height: 18 }} />
            <span className="lst-skeleton" style={{ width: "34%", height: 11 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface ListEmptyProps {
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
  icon?: SutaeruIconName;
}

export function ListEmpty({ title, text, action, icon = "make" }: ListEmptyProps) {
  return (
    <div className="lst-empty">
      <span className="lst-art tall" aria-hidden="true">
        <SutaeruIcon name={icon} signal={false} />
      </span>
      <p className="title">{title}</p>
      {text ? <p className="lede" style={{ fontSize: 15 }}>{text}</p> : null}
      {action}
    </div>
  );
}

/** Search brought nothing back: say what was typed, offer the way out. */
export function NoResults({ query, onClear }: { query: string; onClear?: () => void }) {
  return (
    <div className="lst-empty">
      <p className="title" style={{ fontSize: 20 }}>Nothing matches “{query}”.</p>
      {onClear ? (
        <button type="button" className="btn ghost" onClick={onClear}>
          Clear the search
        </button>
      ) : null}
    </div>
  );
}
