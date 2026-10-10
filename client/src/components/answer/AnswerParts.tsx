import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowRight, ChevronLeft, Copy, Share2, FolderOpen, FileText, Presentation, Table2 } from "lucide-react";
import { FocusBrackets, useReducedMotion } from "@/components/art";
import { cn } from "@/lib/utils";
import { AnswerFold } from "@/components/chat/AnswerFold";

/** Presentational pieces of the Chat answer screen. No data fetching: the lab and the chat container both feed them. */

export interface AnswerSource {
  /** Stable id. In the chat this is the F-03 anchor id (`src-<messageId>-<n>`). */
  id: string;
  /** Host label, e.g. `irena.org`. */
  host: string;
  title: string;
  href?: string;
  /** The number a citation chip uses. */
  number: number;
}

const letterOf = (host: string) => (host.replace(/^www\./, "")[0] ?? "?").toUpperCase();

export type SearchLineState = "searching" | "done" | "error" | "cancelled" | "offline";

/** The four ascending signal bars from the canvas; `level` of them are inked. */
function SignalBars({ level }: { level: number }) {
  return (
    <svg className="signal" width="22" height="20" viewBox="0 0 22 20" aria-hidden="true">
      {[8, 12, 16, 20].map((h, i) => (
        <rect key={h} x={i * 6} y={20 - h} width="4" height={h} rx="1" fill="var(--ink)" opacity={i < level ? 1 : 0.18} />
      ))}
    </svg>
  );
}

/** "Searching the web · 3 of 14" with the orb, or "Searched 14 sources · 6 s" with the signal bars. */
export function SearchLine({ state, text, level = 4 }: { state: SearchLineState; text: string; level?: number }) {
  return (
    <div className={cn("search-line", `is-${state}`)} role="status" aria-live="polite">
      {state === "searching" ? (
        <span className="orb" aria-hidden="true" />
      ) : state === "done" ? (
        <SignalBars level={level} />
      ) : (
        <span className={cn("live-dot", state === "error" && "is-alert")} aria-hidden="true" />
      )}
      <span className="mono">{text}</span>
    </div>
  );
}

export interface SourceCardsProps {
  sources: AnswerSource[];
  /** Id of the card that carries the focus brackets. */
  activeId?: string | null;
  /** Number of cards that have landed so far; the rest wait invisible. Default: all. */
  landed?: number;
  onSelect?: (source: AnswerSource) => void;
  label?: string;
  className?: string;
}

/** Horizontal scroller of source cards; they land one by one and the active one wears focus brackets. */
export function SourceCards({ sources, activeId, landed, onSelect, label = "Sources", className }: SourceCardsProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !activeId || box.scrollWidth <= box.clientWidth) return;
    const el = Array.from(box.children).find((c) => (c as HTMLElement).dataset.srcId === activeId) as HTMLElement | undefined;
    if (!el) return;
    const er = el.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    if (er.left >= br.left && er.right <= br.right) return;
    box.scrollTo({ left: Math.max(0, el.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft - 20), behavior: reduce ? "auto" : "smooth" });
  }, [activeId, reduce]);

  return (
    <div className={cn("sources", className)} ref={boxRef} role="list" aria-label={label}>
      {sources.map((s, i) => {
        const on = s.id === activeId;
        const pending = landed !== undefined && i >= landed;
        const body = (
          <>
            {on && <FocusBrackets legLength={10} offset={7} />}
            <span className="src-head">
              <span className="letter" aria-hidden="true">{letterOf(s.host)}</span>
              <span className="mono">{s.host}</span>
            </span>
            <b>{s.title}</b>
          </>
        );
        const common = {
          id: s.id,
          "data-src-id": s.id,
          role: "listitem" as const,
          className: cn("src", on && "is-on", pending && "pending"),
          "aria-label": `Source ${s.number}: ${s.title}, ${s.host}`,
          "aria-hidden": pending || undefined,
          tabIndex: pending ? -1 : undefined,
        };
        return s.href ? (
          <a key={s.id} {...common} href={s.href} target="_blank" rel="noreferrer" onClick={() => onSelect?.(s)}>{body}</a>
        ) : (
          <button key={s.id} type="button" {...common} onClick={() => onSelect?.(s)}>{body}</button>
        );
      })}
    </div>
  );
}

export interface ChartDatum { label: string; value: number; unit?: string }

/** Bars that draw in (scaleY from the baseline) once `drawn` flips. */
export function AnswerChart({ title, data, highlight, drawn }: { title: string; data: ChartDatum[]; highlight: number; drawn: boolean }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      <p className="mono" style={{ marginBottom: 6 }}>{title}</p>
      <div className={cn("chart", drawn && "drawn")} role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${d.value} ${d.unit ?? ""}`).join(", ")}`}>
        {data.map((d, i) => (
          <div className="col" key={d.label}>
            <span className="mono tnum">{d.value} {d.unit ?? ""}</span>
            <span className={cn("bar-v", i === highlight && "hl")} style={{ height: `${(d.value / max) * 84}px`, transitionDelay: `${i * 140}ms` }} />
          </div>
        ))}
      </div>
      <div className="chart-x" aria-hidden="true">{data.map((d) => <span className="mono" key={d.label}>{d.label}</span>)}</div>
    </div>
  );
}

export type TurnKind = "report" | "deck" | "sheet";
const TURN: Array<{ id: TurnKind; name: string; Icon: typeof FileText }> = [
  { id: "report", name: "Report", Icon: FileText },
  { id: "deck", name: "Deck", Icon: Presentation },
  { id: "sheet", name: "Sheet", Icon: Table2 },
];

/** "Turn this into": pick an output, hand the answer to Agent. */
export function TurnInto({ value, onChange, onHandOff, disabled }: { value: TurnKind; onChange: (k: TurnKind) => void; onHandOff: () => void; disabled?: boolean }) {
  return (
    <AnswerFold label="Turn this into" summary={TURN.find((t) => t.id === value)?.name} className="turn">
      <div className="turn-opts" role="radiogroup" aria-label="Output">
        {TURN.map(({ id, name, Icon }) => (
          <button key={id} type="button" className="turn-opt" role="radio" aria-checked={value === id} onClick={() => onChange(id)}>
            <span className="tt"><Icon size={26} strokeWidth={1.5} aria-hidden="true" /></span>
            <span>{name}</span>
          </button>
        ))}
      </div>
      <button type="button" className="btn ink big" style={{ width: "100%" }} disabled={disabled} onClick={onHandOff}>
        Hand to Agent <ArrowRight size={18} aria-hidden="true" />
      </button>
    </AnswerFold>
  );
}

export function RelatedList({ items, onPick }: { items: string[]; onPick: (q: string) => void }) {
  return (
    <div>
      <p className="mono" style={{ marginBottom: 8 }}>Related</p>
      <div className="related">
        {items.map((r) => (
          <button key={r} type="button" onClick={() => onPick(r)}>{r}<ArrowRight className="ico" aria-hidden="true" /></button>
        ))}
      </div>
    </div>
  );
}

export function AnswerTools({ onCopy, onSave, onShare }: { onCopy?: () => void; onSave?: () => void; onShare?: () => void }) {
  return (
    <div className="answer-tools">
      <button type="button" className="icon-btn flat" aria-label="Copy answer" onClick={onCopy}><Copy size={20} aria-hidden="true" /></button>
      <button type="button" className="icon-btn flat" aria-label="Save to Files" onClick={onSave}><FolderOpen size={20} aria-hidden="true" /></button>
      <button type="button" className="icon-btn flat" aria-label="Share" onClick={onShare}><Share2 size={20} aria-hidden="true" /></button>
    </div>
  );
}

export function BackLink({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="btn ghost backlink" onClick={onClick}>
      <ChevronLeft size={18} aria-hidden="true" />{children}
    </button>
  );
}

/** Follow-up composer, pinned to the foot of the screen; the form is real so Enter sends. */
export function FollowComposer({ onSend, disabled, placeholder = "Ask a follow up", seed }: { onSend: (q: string) => void; disabled?: boolean; placeholder?: string; seed?: string }) {
  const [value, setValue] = useState("");
  useEffect(() => { if (seed) setValue(seed); }, [seed]);
  return (
    <div className="follow">
      <form
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          const v = value.trim();
          if (!v || disabled) return;
          onSend(v);
          setValue("");
        }}
      >
        <label className="sr" htmlFor="answer-follow">{placeholder}</label>
        <input id="answer-follow" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} enterKeyHint="send" />
        <button type="submit" className="icon-btn ink" aria-label="Send" disabled={disabled || !value.trim()}><ArrowUp size={20} aria-hidden="true" /></button>
      </form>
    </div>
  );
}
