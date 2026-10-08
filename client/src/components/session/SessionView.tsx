import * as React from "react";
import { cn } from "@/lib/utils";
import { HalftoneFade } from "@/components/art";
import { SutaeruStamp } from "@/components/brand/SutaeruSeal";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { AgentStep } from "@/lib/streamReducer";

export interface SessionViewProps {
  title: string;
  progress: number;
  status: "running" | "stopped" | "done" | "error";
  elapsedMs: number;
  estimatedRemainingMs?: number;
  steps: SessionStep[];
  currentStepIndex: number;
  draft?: SessionDraft;
  showStopConfirm: boolean;
  onStop: () => void;
  onResume: () => void;
  onKeepWorking: () => void;
  onSendMessage: (text: string) => void;
  onSkipDemo?: () => void;
  className?: string;
}

export interface SessionStep {
  id: string;
  name: string;
  detail?: string;
  status: "done" | "running" | "queued" | "stopped";
  sourcesTotal?: number;
  sourcesDone?: number;
  pagesTotal?: number;
  pagesDone?: number;
  progress?: number;
}

export interface SessionDraft {
  eyebrow: string;
  title: string;
  lede: string;
  rows: Array<{ label: string; value: string }>;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatRemaining(ms?: number): string {
  if (!ms || ms <= 0) return "Almost done";
  if (ms > 60000) return `About ${Math.round(ms / 60000)} min left`;
  if (ms >= 10000) return `About ${Math.round(ms / 5000) * 5} sec left`;
  return "Almost done";
}

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIAL_DOTS = (() => {
  const N = 220;
  const R = seeded(7);
  const result: Array<{ cx: number; cy: number; r: number }> = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const rad = 40 + (R() - 0.5) * 7;
    result.push({ cx: 50 + Math.cos(a) * rad, cy: 50 + Math.sin(a) * rad, r: 0.6 + R() * 1.1 });
  }
  return result;
})();

function StippleDial({ progress, label, size = 96 }: { progress: number; label: string; size?: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const visibleCount = Math.round((pct / 100) * DIAL_DOTS.length);

  return (
    <div className="dial" role="img" aria-label={`Progress ${pct} percent, ${label}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="40" fill="none" strokeWidth="9" style={{ stroke: "var(--seg-off)", opacity: 0.55 }} />
        <g className="dd">
          {DIAL_DOTS.slice(0, visibleCount).map((dot, i) => (
            <circle key={i} cx={dot.cx} cy={dot.cy} r={dot.r} className="f-acc" />
          ))}
        </g>
      </svg>
      <b className="dial-pct tnum">{pct}<small>%</small></b>
    </div>
  );
}

function StepFlow({ steps, currentIndex, status, stoppedAt }: { steps: SessionStep[]; currentIndex: number; status: "running" | "stopped" | "done" | "queued"; stoppedAt?: number }) {
  return (
    <div className="flow">
      {steps.map((step, i) => {
        const isDone = i < currentIndex || (i === currentIndex && status === "done");
        const isCurrent = i === currentIndex && (status === "running" || status === "stopped");
        const isStopped = i === currentIndex && status === "stopped";
        const isNext = i > currentIndex || (i === currentIndex && status === "queued");

        const sideText = isDone ? "Done" : isCurrent ? (isStopped ? "Stopped" : "In progress") : "Queued";
        const sideColor = isStopped ? "var(--alert)" : isCurrent ? "var(--ink)" : "var(--quiet)";

        return (
          <div key={step.id} className={cn("fl", isCurrent && !isStopped && "cur", isStopped && "cur", isNext && "next")} style={{ position: "relative", paddingBottom: 20 }}>
            {i < steps.length - 1 && (
              <div
                className="brk-line"
                style={{
                  position: "absolute",
                  left: 12,
                  top: isCurrent ? 18 : 0,
                  bottom: 0,
                  width: 0,
                  borderLeft: `1.5px ${isCurrent ? "dashed var(--accent)" : "solid var(--ink)"}`,
                }}
              />
            )}
            <div className="nd" style={{ width: 26, height: 26, display: "grid", placeItems: "center", position: "relative", zIndex: 1 }}>
              {isCurrent ? (
                <span className="dot" style={{ width: 11, height: 11, borderRadius: "50%", background: isStopped ? "var(--alert)" : "var(--accent)" }} />
              ) : (
                <span className="dot" style={{ width: isDone ? 11 : 9, height: isDone ? 11 : 9, borderRadius: "50%", background: isDone ? "var(--ink)" : "var(--rule)" }} />
              )}
            </div>
            <b style={{ font: "700 17px/1.3 var(--disp)", letterSpacing: "-.01em", color: isNext ? "var(--quiet)" : "var(--ink)" }}>{step.name}</b>
            <span className="mono side" style={{ paddingTop: 4, textAlign: "right", color: sideColor }}>{sideText}</span>
            {(isCurrent || isStopped) && step.sourcesTotal && (
              <div className="detail" style={{ gridColumn: "2 / -1", display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                <div className="row" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="stepped" id="srcBars" style={{ display: "inline-flex", alignItems: "flex-end", gap: 3 }} aria-hidden="true">
                    {Array.from({ length: 10 }, (_, j) => (
                      <i
                        key={j}
                        className={j < Math.floor((step.progress || 0) * 10) ? "" : j === Math.floor((step.progress || 0) * 10) && !isStopped ? "live" : "off"}
                        style={{ width: 5, borderRadius: "1.5px", height: 6 + j * 2, transition: "background var(--t)" }}
                      />
                    ))}
                  </span>
                  <span className="mono tnum">{Math.round((step.progress || 0) * step.sourcesTotal)} of {step.sourcesTotal}</span>
                </div>
              </div>
            )}
            {(isCurrent || isStopped) && step.pagesTotal && (
              <div className="detail" style={{ gridColumn: "2 / -1", display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                <span className="file-chip is-on" style={{ position: "relative", alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", font: "500 13px/1 var(--mono)", margin: "6px 6px" }}>
                  <span className={cn("brk", "tight", isStopped && "alert")} style={{ position: "absolute", inset: -6, pointerEvents: "none", color: isStopped ? "var(--alert)" : "var(--ink)", opacity: isCurrent || isStopped ? 1 : 0, transform: isCurrent || isStopped ? "none" : "scale(1.04)", transition: "opacity 220ms var(--ease), transform 420ms var(--ease)" }} aria-hidden="true">
                    <i style={{ position: "absolute", width: 9, height: 9, border: "0 solid currentColor" }} />
                    <i style={{ position: "absolute", width: 9, height: 9, border: "0 solid currentColor", right: 0, top: 0, borderRightWidth: "1.5px", borderTopWidth: "1.5px" }} />
                    <i style={{ position: "absolute", width: 9, height: 9, border: "0 solid currentColor", left: 0, bottom: 0, borderLeftWidth: "1.5px", borderBottomWidth: "1.5px" }} />
                    <i style={{ position: "absolute", width: 9, height: 9, border: "0 solid currentColor", right: 0, bottom: 0, borderRightWidth: "1.5px", borderBottomWidth: "1.5px" }} />
                  </span>
                  <SutaeruIcon name="report" className="s" style={{ width: 16, height: 16 }} />
                  {step.detail}
                </span>
                <div className="pages" style={{ display: "flex", gap: 3 }} aria-hidden="true">
                  {Array.from({ length: step.pagesTotal }, (_, j) => (
                    <i key={j} className={j < (step.pagesDone || 0) ? "on" : j === (step.pagesDone || 0) && !isStopped ? "live" : ""} style={{ flex: 1, maxWidth: 18, height: 5, borderRadius: 3, background: j < (step.pagesDone || 0) ? "var(--ink)" : j === (step.pagesDone || 0) && !isStopped ? "var(--accent)" : "var(--seg-off)", transition: "background var(--t)" }} />
                  ))}
                </div>
                <span className="mono tnum">Page {Math.min(step.pagesTotal, (step.pagesDone || 0) + 1)} of {step.pagesTotal}</span>
              </div>
            )}
            {(isCurrent || isStopped) && (step.name.includes("Write") || step.name.includes("Plan")) && (
              <div className="detail" style={{ gridColumn: "2 / -1", display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                <canvas className="bar" style={{ display: "block", width: "100%", height: 14 }} aria-hidden="true" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DraftCard({ draft, progress, status }: { draft: SessionDraft; progress: number; status: "running" | "stopped" | "done" }) {
  const isDone = status === "done";
  const ditherProgress = isDone ? 1 : Math.min(0.97, progress * 1.05);

  return (
    <div className="card draft">
      <div className="draft-doc">
        <div style={{ opacity: 0.25 + 0.75 * ditherProgress, transition: "opacity 500ms var(--ease)" }}>
          <div style={{ aspectRatio: "1.6", borderRadius: 12, background: "var(--panel)", overflow: "hidden" }}>
            <svg viewBox="0 0 560 340" style={{ width: "100%", height: "100%" }}>
              <rect x="0" y="0" width="560" height="340" fill="var(--paper)" />
              <rect x="20" y="20" width="520" height="300" rx="8" fill="var(--card)" stroke="var(--stroke)" />
              <text x="40" y="60" fontFamily="var(--disp)" fontSize="24" fontWeight="800" fill="var(--ink)">Report cover</text>
              <text x="40" y="100" fontFamily="var(--body)" fontSize="14" fill="var(--quiet)">{draft.title}</text>
              <rect x="40" y="120" width="200" height="80" rx="4" fill="var(--accent-tint)" />
              <text x="50" y="165" fontFamily="var(--body)" fontSize="12" fill="var(--accent)">Cover photo</text>
              <text x="40" y="240" fontFamily="var(--disp)" fontSize="18" fontWeight="700" fill="var(--ink)">Key figures</text>
              <rect x="40" y="250" width="480" height="40" rx="4" fill="var(--panel)" />
              <rect x="40" y="300" width="480" height="20" rx="4" fill="var(--seg-off)" />
            </svg>
          </div>
        </div>
        <HalftoneFade direction="radial" gridSize={6} dotRadius={1.3} opacity={Math.max(0, 0.45 * (1 - ditherProgress))} className="draft-fade" style={{ borderRadius: 12 }} />
      </div>
      <span className="mono" style={{ display: "block", marginTop: 14 }}>{draft.eyebrow}</span>
      <h3>{draft.title}</h3>
      <p>{draft.lede}</p>
      {draft.rows.map((row, i) => (
        <div key={i} className={cn("sup", !isDone && progress < 0.5 + i * 0.16 && "pending")}>
          <b>{row.label}</b>
          <span className="mono">{row.value}</span>
        </div>
      ))}
      {isDone && (
        <Button className="btn ink big" style={{ width: "100%", marginTop: 16 }} onClick={() => {}}>
          Open the report <SutaeruIcon name="arrow" className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}

function NextCard({ status, onOpenDone }: { status: "running" | "stopped" | "done"; onOpenDone?: () => void }) {
  if (status === "done") {
    return (
      <div className="hero-card next-card">
        <HalftoneFade direction="radial" gridSize={6} dotRadius={1.2} color="var(--hero-ink)" opacity={0.2} className="handoff-fade" style={{ inset: "0 0 0 auto", width: 150 }} />
        <span className="mono">Sent</span>
        <b>The file is on Telegram and in Files.</b>
        <Button className="btn ink big" onClick={onOpenDone} style={{ alignSelf: "flex-start" }}>
          Open result <SutaeruIcon name="arrow" className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="hero-card next-card">
      <HalftoneFade direction="radial" gridSize={6} dotRadius={1.2} color="var(--hero-ink)" opacity={0.2} className="handoff-fade" style={{ inset: "0 0 0 auto", width: 150 }} />
      <span className="mono">What happens next</span>
      <b>Sutaeru finishes the file, then pings you on Telegram. You can close the app.</b>
    </div>
  );
}

function StopArea({ status, showConfirm, progress, onStop, onResume, onKeepWorking, onConfirmStop }: {
  status: "running" | "stopped" | "done";
  showConfirm: boolean;
  progress: number;
  onStop: () => void;
  onResume: () => void;
  onKeepWorking: () => void;
  onConfirmStop: () => void;
}) {
  if (status === "done") {
    return (
      <div className="card banner" style={{ padding: 18, display: "flex", alignItems: "center", gap: 12 }}>
        <MiniStamp />
        <div className="tx" style={{ flex: 1 }}>
          <b>Report ready.</b>
          <span className="mono">Telegram notified · saved to Files</span>
        </div>
        <Button className="btn ink" onClick={onConfirmStop}>Open <SutaeruIcon name="arrow" className="h-5 w-5" /></Button>
      </div>
    );
  }

  if (status === "stopped") {
    return (
      <div className="card banner stop-confirm" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12, borderColor: "var(--alert)" }}>
        <div className="tx">
          <b>Stopped at {Math.round(progress * 100)}%.</b>
          <span className="mono">What Sutaeru found so far is kept</span>
        </div>
        <Button className="btn ink" onClick={onResume}>
          <SutaeruIcon name="plan" className="h-5 w-5" /> Resume
        </Button>
      </div>
    );
  }

  if (showConfirm) {
    return (
      <div className="card banner stop-confirm" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12, borderColor: "var(--alert)" }}>
        <div className="tx">
          <b>Stop this session?</b>
          <span className="mono">Sutaeru keeps what it found so far</span>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <Button className="btn" onClick={onKeepWorking}>Keep working</Button>
          <Button className="btn alert" onClick={onConfirmStop}>
            <SutaeruIcon name="pause" className="h-5 w-5" /> Stop
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="row" style={{ marginTop: 14, alignItems: "center", gap: 12 }}>
      <Button className="btn" onClick={onStop}>
        <SutaeruIcon name="pause" className="h-5 w-5" /> Stop
      </Button>
      <span className="mono">You can close the app. It keeps going.</span>
    </div>
  );
}

function MiniStamp() {
  return (
    <span className="mini-stamp" aria-hidden="true">
      <SutaeruStamp className="stamp" style={{ width: "100%", height: "100%", display: "block" }} />
    </span>
  );
}

function Composer({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = React.useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <form onSubmit={handleSubmit} className="followup">
      <label htmlFor="session-message" className="sr">Message Sutaeru</label>
      <input
        id="session-message"
        type="text"
        placeholder="Message Sutaeru while it works"
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontSize: 16, color: "var(--ink)" }}
        enterKeyHint="send"
      />
      <Button type="submit" className="icon-btn ink" style={{ width: 44, height: 44 }} aria-label="Send">
        <SutaeruIcon name="arrow" className="h-5 w-5" />
      </Button>
    </form>
  );
}

export function SessionView({
  title,
  progress,
  status,
  elapsedMs,
  estimatedRemainingMs,
  steps,
  currentStepIndex,
  draft,
  showStopConfirm,
  onStop,
  onResume,
  onKeepWorking,
  onSendMessage,
  onSkipDemo,
  className,
}: SessionViewProps) {
  const handleConfirmStop = () => {
    onStop();
  };

  const handleBack = () => {};
  const remainingLabel = status === "done" ? "Done" : status === "stopped" ? "Stopped" : formatRemaining(estimatedRemainingMs);

  return (
    <section className={cn("view wide view-enter", className)} id="view-session">
      <div className="sess-head">
        <div className="tx">
          <Button className="btn ghost backlink" variant="ghost" onClick={handleBack} style={{ marginBottom: 6 }}>
            <SutaeruIcon name="arrow" className="h-5 w-5" /> Home
          </Button>
          <h1 className="title">
            {title}
          </h1>
          <div className="sess-meta" id="sessMeta">
            {status === "done" ? (
              <span className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 26, padding: "0 10px", borderRadius: 999, background: "var(--panel)", font: "500 11px/1 var(--mono)", letterSpacing: "1.54px", textTransform: "uppercase", color: "var(--ink)" }}>Done</span>
            ) : status === "stopped" ? (
              <span className="tag alert" style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 26, padding: "0 10px", borderRadius: 999, background: "var(--alert-tint)", font: "500 11px/1 var(--mono)", letterSpacing: "1.54px", textTransform: "uppercase", color: "var(--alert)" }}>Stopped</span>
            ) : (
              <span className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 26, padding: "0 10px", borderRadius: 999, background: "var(--panel)", font: "500 11px/1 var(--mono)", letterSpacing: "1.54px", textTransform: "uppercase", color: "var(--ink)" }}>
                <span className="live-dot pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", flex: "none", display: "inline-block", animation: "dotpulse 1.6s ease-in-out infinite" }} />
                Working
              </span>
            )}
            <span className="mono tnum">Elapsed {formatDuration(elapsedMs)}</span>
            {status === "running" && <span className="mono">{remainingLabel}</span>}
          </div>
        </div>
        <StippleDial progress={progress} label={remainingLabel} size={96} />
      </div>

      <div id="stopArea">
        <StopArea
          status={status as "running" | "stopped" | "done"}
          showConfirm={showStopConfirm}
          progress={progress}
          onStop={onStop}
          onResume={onResume}
          onKeepWorking={onKeepWorking}
          onConfirmStop={handleConfirmStop}
        />
      </div>

      <div className="sess-grid">
        <div className="panel prog">
          <div className="between" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span className="mono">Progress</span>
            <span className="mono ink" id="stepOf" style={{ fontVariantNumeric: "tabular-nums" }}>
              {status === "done" ? `${steps.length} of ${steps.length}` : `Step ${Math.min(currentStepIndex + 1, steps.length)} of ${steps.length}`}
            </span>
          </div>
          <StepFlow steps={steps} currentIndex={currentStepIndex} status={status as "running" | "stopped" | "done"} />
        </div>
        <div className="stack">
          {draft && <DraftCard draft={draft} progress={progress} status={status as "running" | "stopped" | "done"} />}
          <NextCard status={status as "running" | "stopped" | "done"} onOpenDone={() => {}} />
        </div>
      </div>

      {status !== "done" && onSkipDemo && (
        <p style={{ margin: "14px 0 0" }}>
          <Button className="demo-link mono" variant="ghost" onClick={onSkipDemo} style={{ padding: 0, font: "500 11px/1 var(--mono)", letterSpacing: "1.54px", textTransform: "uppercase" }}>
            Demo · skip ahead
          </Button>
        </p>
      )}

      <div className="sess-follow">
        <Composer onSend={onSendMessage} />
      </div>
    </section>
  );
}

export default SessionView;