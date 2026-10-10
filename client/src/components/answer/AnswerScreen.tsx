import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { RotateCcw, WifiOff } from "lucide-react";
import { PaperGrain, useReducedMotion } from "@/components/art";
import { cn } from "@/lib/utils";
import { AnswerFold } from "@/components/chat/AnswerFold";
import {
  AnswerChart,
  AnswerTools,
  BackLink,
  FollowComposer,
  RelatedList,
  SearchLine,
  SourceCards,
  TurnInto,
  type AnswerSource,
  type ChartDatum,
  type SearchLineState,
  type TurnKind,
} from "./AnswerParts";

export type AnswerScreenState = "searching" | "streaming" | "done" | "error" | "cancelled" | "approval" | "offline";
export type AnswerSegment = string | { c: number };

export interface AnswerScreenProps {
  state: AnswerScreenState;
  question: string;
  kicker?: string;
  sources: AnswerSource[];
  segments: AnswerSegment[];
  tail?: AnswerSegment[];
  chart?: { title: string; data: ChartDatum[]; highlight: number };
  facts?: Array<[string, string]>;
  related?: string[];
  summary?: string;
  /** Slot rendered under the answer card: steps panel, approval card. */
  extra?: React.ReactNode;
  errorMessage?: string;
  onBack?: () => void;
  onSend?: (q: string) => void;
  onRetry?: () => void;
  onHandOff?: (kind: TurnKind) => void;
  /** Run the sources-land / words-stream / chart-draws sequence (lab and first paint). */
  animate?: boolean;
}

/** Words of the sample answer stream at 28 ms apiece, as in the prototype. */
const WORD_MS = 28;

/** Chat answer screen: presentational. The chat container feeds the same parts with real data. */
export function AnswerScreen(p: AnswerScreenProps) {
  const reduce = useReducedMotion();
  const play = (p.animate ?? true) && !reduce;
  const { state } = p;

  const [landed, setLanded] = useState(() => (play && state === "searching" ? 0 : p.sources.length));
  const [active, setActive] = useState<string | null>(p.sources[0]?.id ?? null);
  const [words, setWords] = useState(() => (play && state === "streaming" ? 0 : Infinity));
  const [drawn, setDrawn] = useState(!play || state === "done" || state === "approval" || state === "cancelled" || state === "offline");
  const [turn, setTurn] = useState<TurnKind>("report");
  const [seed, setSeed] = useState<string | undefined>();

  // Sources land one by one while searching.
  useEffect(() => {
    if (state !== "searching") return;
    if (!play) { setLanded(Math.min(3, p.sources.length)); return; }
    setLanded(0);
    let n = 0;
    const t = window.setInterval(() => {
      n += 1;
      setLanded(n);
      setActive(p.sources[n - 1]?.id ?? null);
      if (n >= Math.min(3, p.sources.length)) window.clearInterval(t);
    }, 700);
    return () => window.clearInterval(t);
  }, [state, play, p.sources]);

  const flat = useMemo(() => [...p.segments, ...(p.tail ?? [])], [p.segments, p.tail]);
  const totalWords = useMemo(
    () => flat.reduce<number>((n, s) => n + (typeof s === "string" ? s.split(" ").length : 0), 0),
    [flat],
  );

  // The answer streams word by word, then the chart draws in.
  useEffect(() => {
    if (state !== "streaming" || !play) return;
    setWords(0);
    let n = 0;
    const t = window.setInterval(() => {
      n += 1;
      setWords(n);
      if (n >= totalWords) { window.clearInterval(t); window.setTimeout(() => setDrawn(true), 260); }
    }, WORD_MS * 2);
    return () => window.clearInterval(t);
  }, [state, play, totalWords]);

  const showSources = state !== "error" || p.sources.length > 0;
  const showAnswer = state !== "searching" && state !== "error";
  const searchState: SearchLineState = state === "searching" ? "searching" : state === "error" ? "error" : state === "offline" ? "offline" : state === "cancelled" ? "cancelled" : "done";
  const searchText =
    state === "searching" ? `Searching the web · ${Math.min(14, Math.round(landed * 2.8))} of 14`
    : state === "error" ? "Search stopped"
    : state === "cancelled" ? "Stopped · 3 sources read"
    : state === "offline" ? "Offline · saved answer"
    : p.summary ?? `Searched ${p.sources.length} sources`;

  let seen = 0;
  const renderSeg = (s: AnswerSegment, i: number) => {
    if (typeof s !== "string") {
      const src = p.sources[s.c - 1];
      return (
        <React.Fragment key={`c${i}`}>
          <button
            type="button"
            className={cn("cite", src && src.id === active && "on")}
            aria-label={`Source ${s.c}${src ? `: ${src.title}` : ""}`}
            onClick={() => src && setActive(src.id)}
          >{s.c}</button>{" "}
        </React.Fragment>
      );
    }
    return s.split(" ").map((w, j) => {
      const idx = seen++;
      return <span key={`${i}-${j}`} className={cn("stream-word", idx < words && "in")}>{w} </span>;
    });
  };
  const head = showAnswer ? p.segments.map(renderSeg) : null;
  const tail = showAnswer && p.tail ? p.tail.map((s, i) => renderSeg(s, i + p.segments.length)) : null;

  return (
    <div className="answer-screen" data-state={state}>
      <PaperGrain />
      <section className="view wide" id="view-answer">
        <div className="answer-grid">
          <div className="answer-main">
            {state === "offline" && (
              <div className="answer-note" role="status"><WifiOff size={16} aria-hidden="true" />You're offline. This answer is saved; your follow up will send when you reconnect.</div>
            )}
            <BackLink onClick={p.onBack}>Chat</BackLink>
            <p className="mono">{p.kicker ?? "Chat · Example answer"}</p>
            <h1 className="title q-title">{p.question}</h1>
            <SearchLine state={searchState} text={searchText} />
            {showSources && (
              <AnswerFold
                label="Sources"
                summary={`${p.sources.length} · ${[...new Set(p.sources.map((s) => s.host))].slice(0, 3).join(", ")}`}
                defaultOpen={state === "searching"}
              >
                <SourceCards
                  sources={p.sources}
                  activeId={active}
                  landed={state === "searching" ? landed : undefined}
                  onSelect={(s) => setActive(s.id)}
                  label="Sources for this answer"
                />
              </AnswerFold>
            )}

            {state === "error" && (
              <div className="answer-error" role="alert">
                <b>Sutaeru couldn't finish this answer.</b>
                <p>{p.errorMessage ?? "The search timed out before any answer was written. Nothing was lost."}</p>
                <button type="button" className="btn ink" onClick={p.onRetry}><RotateCcw size={16} aria-hidden="true" />Try again</button>
              </div>
            )}

            {showAnswer && (
              <article className="card answer-card" aria-busy={state === "streaming"} data-landed="true">
                <p>{head}</p>
                {p.chart && (
                  <div className="fig">
                    <AnswerChart title={p.chart.title} data={p.chart.data} highlight={p.chart.highlight} drawn={drawn} />
                    {p.facts && (
                      <div className="kv">
                        {p.facts.map(([k, v]) => <div key={k}><span className="mono">{k}</span><b className="tnum">{v}</b></div>)}
                      </div>
                    )}
                  </div>
                )}
                {tail && <p className="lede">{tail}</p>}
                {state === "cancelled" && <p className="answer-stopped mono">Stopped by you. The answer above is what was written.</p>}
                {(state === "done" || state === "approval" || state === "offline") && <AnswerTools />}
                {state === "cancelled" && (
                  <div className="answer-tools"><button type="button" className="btn" onClick={p.onRetry}><RotateCcw size={16} aria-hidden="true" />Continue</button></div>
                )}
              </article>
            )}
            {p.extra}
          </div>
          {(state === "done" || state === "approval" || state === "offline") && (
            <aside className="rail">
              {p.related && <RelatedList items={p.related} onPick={setSeed} />}
              <TurnInto value={turn} onChange={setTurn} onHandOff={() => p.onHandOff?.(turn)} disabled={state === "offline"} />
            </aside>
          )}
        </div>
        <FollowComposer onSend={(q) => p.onSend?.(q)} seed={seed} placeholder={state === "offline" ? "Ask a follow up (sends when online)" : "Ask a follow up"} disabled={state === "searching" || state === "streaming"} />
      </section>
    </div>
  );
}

export default AnswerScreen;
