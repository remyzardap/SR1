import * as React from "react";
import { cn } from "@/lib/utils";
import { ApprovalCard } from "@/components/chat/ApprovalCard";
import type { ApprovalRequest } from "@/lib/sse";
import { DotMatrixValue } from "./DotMatrixValue";

export interface SessionViewProps {
  title: string;
  subtitle?: string;
  progress: number;
  status: "running" | "stopped" | "done" | "error";
  elapsedMs: number;
  estimatedRemainingMs?: number;
  steps: SessionStep[];
  currentStepIndex: number;
  draft?: SessionDraft;
  showStopConfirm: boolean;
  errorMessage?: string;
  approvals?: ApprovalRequest[];
  onApprovalDecision?: (id: string, decision: "approve" | "reject") => void;
  onStop: () => void;
  onConfirmStop?: () => void;
  onResume: () => void;
  onKeepWorking: () => void;
  onSendMessage: (text: string) => void;
  onSkipDemo?: () => void;
  onBack?: () => void;
  onOpenResult?: () => void;
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

const LOOP_PATH =
  "M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z";

const BLUR_STEPS = Array.from({ length: 16 }, (_, i) => {
  const t = i / 15;
  return {
    strokeWidth: (9 - 7 * Math.pow(t, 0.8)).toFixed(2),
    strokeOpacity: (0.6 * (1 - Math.pow(t, 0.6))).toFixed(3),
    delay: `${(i * 0.0135).toFixed(3)}s`,
  };
});

const INK_STEPS = Array.from({ length: 34 }, (_, i) => {
  const t = i / 33;
  return {
    strokeWidth: (5 - 4 * Math.pow(t, 0.8)).toFixed(2),
    strokeOpacity: (1 - Math.pow(t, 0.6)).toFixed(3),
    delay: `${(i * 0.0135).toFixed(3)}s`,
  };
});

export function formatDuration(ms: number): string {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDurationAria(ms: number, suffix: string): string {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const minPart = minutes > 0 ? `${minutes} ${minutes === 1 ? "minute" : "minutes"} ` : "";
  const secPart = `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  return `${minPart}${secPart} ${suffix}`.trim();
}

function splitTitle(title: string, subtitle?: string): [string, string] {
  if (subtitle !== undefined) {
    return [title, subtitle];
  }
  const trimmed = title.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length <= 1) {
    return [trimmed || "Agent", "session"];
  }
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}

function ProgressRing({ progress }: { progress: number }) {
  const clamped = Math.max(0, Math.min(1, progress));
  const activeSteps = Math.round(clamped * 30);
  const ta = (activeSteps / 30) * Math.PI;

  const rx1 = (150 + 128 * Math.sin(ta)).toFixed(1);
  const ry1 = (150 - 128 * Math.cos(ta)).toFixed(1);
  const rx2 = (150 + 148 * Math.sin(ta)).toFixed(1);
  const ry2 = (150 - 148 * Math.cos(ta)).toFixed(1);

  const lx1 = (150 - 128 * Math.sin(ta)).toFixed(1);
  const ly1 = (150 - 128 * Math.cos(ta)).toFixed(1);
  const lx2 = (150 - 148 * Math.sin(ta)).toFixed(1);
  const ly2 = (150 - 148 * Math.cos(ta)).toFixed(1);

  return (
    <svg
      aria-hidden="true"
      width="300"
      height="300"
      viewBox="0 0 300 300"
      style={{ display: "block" }}
    >
      {Array.from({ length: 60 }, (_, i) => {
        const angle = (i / 60) * Math.PI * 2;
        const cx = (150 + 138 * Math.sin(angle)).toFixed(1);
        const cy = (150 - 138 * Math.cos(angle)).toFixed(1);
        const dist = Math.min(i, 60 - i);
        const isActive = dist <= activeSteps;
        const isMajor = i % 5 === 0;
        const r = isActive ? (isMajor ? "2.8" : "2.1") : isMajor ? "1.8" : "1.3";
        const fill = isActive ? "var(--ink)" : "var(--stroke)";
        return <circle key={i} cx={cx} cy={cy} r={r} fill={fill} />;
      })}
      <line
        x1={rx1}
        y1={ry1}
        x2={rx2}
        y2={ry2}
        stroke="#F4511E"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <line
        x1={lx1}
        y1={ly1}
        x2={lx2}
        y2={ly2}
        stroke="#F4511E"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WorkingMark({ status }: { status: SessionViewProps["status"] }) {
  const label =
    status === "stopped"
      ? "Sutaeru is paused"
      : status === "error"
        ? "Sutaeru encountered an error"
        : status === "done"
          ? "Sutaeru is done"
          : "Sutaeru is working";

  return (
    <svg
      role="img"
      aria-label={label}
      width="200"
      height="106"
      viewBox="0 0 144 76"
      fill="none"
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <filter id="smBlur" x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <radialGradient id="smSunG" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#FFB089" />
          <stop offset=".55" stopColor="#F4511E" />
          <stop offset="1" stopColor="#C93C0E" />
        </radialGradient>
        <radialGradient id="smHaloG">
          <stop offset="0" stopColor="#F4511E" stopOpacity=".8" />
          <stop offset="1" stopColor="#F4511E" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="smFlashG">
          <stop offset="0" stopColor="#FFF6EC" />
          <stop offset=".35" stopColor="#FF9A62" stopOpacity=".8" />
          <stop offset="1" stopColor="#F4511E" stopOpacity="0" />
        </radialGradient>
        <clipPath id="smSea">
          <rect x="84" y="4" width="48" height="56.2" />
        </clipPath>
      </defs>
      <path
        className="sm-a"
        d={LOOP_PATH}
        stroke="var(--ink)"
        strokeWidth="7"
        strokeLinejoin="round"
        style={{ animation: "smBase 4.2s ease-in-out infinite both" }}
      />
      <g filter="url(#smBlur)">
        {BLUR_STEPS.map((s, i) => (
          <path
            key={`bl-${i}`}
            className="sm-c sm-cl"
            d={LOOP_PATH}
            pathLength={100}
            stroke="#F4511E"
            strokeWidth={s.strokeWidth}
            strokeOpacity={s.strokeOpacity}
            strokeDasharray="1.6 98.4"
            style={{ animationDelay: s.delay }}
          />
        ))}
        {BLUR_STEPS.map((s, i) => (
          <path
            key={`br-${i}`}
            className="sm-c sm-cr"
            d={LOOP_PATH}
            pathLength={100}
            stroke="#F4511E"
            strokeWidth={s.strokeWidth}
            strokeOpacity={s.strokeOpacity}
            strokeDasharray="1.6 98.4"
            style={{ animationDelay: s.delay }}
          />
        ))}
      </g>
      <g>
        {INK_STEPS.map((s, i) => (
          <path
            key={`il-${i}`}
            className="sm-c sm-cl"
            d={LOOP_PATH}
            pathLength={100}
            stroke="var(--ink)"
            strokeWidth={s.strokeWidth}
            strokeOpacity={s.strokeOpacity}
            strokeDasharray="1.6 98.4"
            style={{ animationDelay: s.delay }}
          />
        ))}
        {INK_STEPS.map((s, i) => (
          <path
            key={`ir-${i}`}
            className="sm-c sm-cr"
            d={LOOP_PATH}
            pathLength={100}
            stroke="var(--ink)"
            strokeWidth={s.strokeWidth}
            strokeOpacity={s.strokeOpacity}
            strokeDasharray="1.6 98.4"
            style={{ animationDelay: s.delay }}
          />
        ))}
      </g>
      <circle
        cx="72"
        cy="38"
        r="24"
        fill="url(#smFlashG)"
        className="sm-a"
        style={{
          transformBox: "fill-box",
          transformOrigin: "center",
          animation: "smFlash 4.2s cubic-bezier(.2,.7,.3,1) infinite both",
        }}
      />
      <g transform="translate(108 39) scale(.9) translate(-108 -39)">
        <g clipPath="url(#smSea)">
          <circle
            cx="108"
            cy="46.4"
            r="15"
            fill="url(#smHaloG)"
            className="sm-a"
            style={{
              transformBox: "fill-box",
              transformOrigin: "center",
              animation: "smHalo 4.2s ease-in-out infinite both",
            }}
          />
          <circle
            cx="108"
            cy="46.4"
            r="6.3"
            fill="url(#smSunG)"
            className="sm-a"
            style={{
              transformBox: "fill-box",
              transformOrigin: "center",
              animation: "smSun 4.2s cubic-bezier(.3,0,.2,1) infinite both",
            }}
          />
        </g>
        <g
          fill="var(--ink)"
          className="sm-a"
          style={{
            transformBox: "fill-box",
            transformOrigin: "center",
            animation: "smGate 4.2s ease-in-out infinite both",
          }}
        >
          <path d="M89.2 21.4L90.5 22.5Q108 27.1 125.5 22.5L126.8 21.4L126.2 25.0Q108 29.9 89.8 25.0Z" />
          <path d="M91.6 26.7Q108 30.7 124.4 26.7L124.2 28.9Q108 32.9 91.8 28.9Z" />
          <path d="M106.7 30.4H109.3V35.2H106.7Z" />
          <path d="M90.6 35.1H125.4V37.7H90.6Z" />
          <path d="M95.8 27.6H99.6L98.6 57.6H94.4ZM116.4 27.6H120.2L121.6 57.6H117.4Z" />
        </g>
        <path
          d="M91.6 60.6H103.2M112.8 60.6H124.4"
          stroke="var(--ink)"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <g
          stroke="#F4511E"
          strokeLinecap="round"
          className="sm-a"
          style={{
            transformBox: "fill-box",
            transformOrigin: "center",
            animation: "smGlint 4.2s ease-in-out infinite both",
          }}
        >
          <path d="M104.8 60.6H111.2" strokeWidth="1.7" />
          <path d="M106.3 63.8H109.7" strokeWidth="1.5" />
        </g>
      </g>
    </svg>
  );
}

export function SessionView({
  title,
  subtitle,
  progress,
  status,
  elapsedMs,
  estimatedRemainingMs,
  steps,
  currentStepIndex,
  draft,
  showStopConfirm,
  errorMessage,
  approvals,
  onApprovalDecision,
  onStop,
  onConfirmStop,
  onResume,
  onKeepWorking,
  onSendMessage,
  onSkipDemo,
  onBack,
  onOpenResult,
  className,
}: SessionViewProps) {
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [noteText, setNoteText] = React.useState("");
  const [moreOpen, setMoreOpen] = React.useState(false);
  const noteInputRef = React.useRef<HTMLInputElement>(null);

  const [titleLead, titleTail] = splitTitle(title, subtitle);

  const hasRemaining = typeof estimatedRemainingMs === "number" && estimatedRemainingMs >= 0;
  const displayMs =
    status === "running" && hasRemaining
      ? estimatedRemainingMs!
      : status === "stopped" && hasRemaining
        ? estimatedRemainingMs!
        : elapsedMs;

  const timerValue = formatDuration(displayMs);
  const timerUnit =
    status === "stopped"
      ? "paused"
      : status === "done"
        ? "done"
        : status === "error"
          ? "failed"
          : hasRemaining
            ? "left"
            : "elapsed";
  const timerAria = formatDurationAria(displayMs, timerUnit);

  const isPausedOrDone = status !== "running";

  const handleToggleNote = () => {
    setNoteOpen((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => noteInputRef.current?.focus(), 20);
      }
      return next;
    });
  };

  const handleNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = noteText.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setNoteText("");
    setNoteOpen(false);
  };

  const handlePrimaryAction = () => {
    if (status === "stopped" || status === "error") {
      onResume();
    } else if (status === "done") {
      if (onOpenResult) onOpenResult();
      else if (onSkipDemo) onSkipDemo();
    } else {
      onStop();
    }
  };

  const primaryAriaLabel =
    status === "stopped" || status === "error"
      ? "Resume"
      : status === "done"
        ? "Open result"
        : "Pause";

  const failedStep = steps.find((s) => s.status === "stopped" && s.detail);
  const resolvedErrorMessage =
    errorMessage ||
    (status === "error" ? failedStep?.detail || "The session encountered an error and could not complete." : undefined);

  return (
    <div
      id="view-session"
      className={cn("q-session-root", isPausedOrDone && "q-session-paused", className)}
    >
      <div className="q-session-stage">
        <header
          style={{
            position: "relative",
            zIndex: 5,
            display: "flex",
            alignItems: "center",
            gap: 6,
            height: 60,
            padding: "0 8px",
            flex: "none",
          }}
        >
          <button
            type="button"
            className="qtap"
            aria-label="Back"
            onClick={onBack}
            style={{
              flex: "none",
              display: "grid",
              placeItems: "center",
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: 0,
              background: "none",
              color: "var(--ink)",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="qtap"
            aria-label="More"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((prev) => !prev)}
            style={{
              flex: "none",
              display: "grid",
              placeItems: "center",
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: 0,
              background: "none",
              color: "var(--ink)",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="5" cy="12" r="1.4" fill="currentColor" />
              <circle cx="12" cy="12" r="1.4" fill="currentColor" />
              <circle cx="19" cy="12" r="1.4" fill="currentColor" />
            </svg>
          </button>
        </header>

        <h1
          style={{
            margin: 0,
            padding: "4px 22px 0",
            fontFamily: "var(--disp)",
            fontWeight: 800,
            fontSize: 30,
            lineHeight: 1,
            letterSpacing: "-.045em",
            animation: "qRise .8s cubic-bezier(.2,.8,.2,1) 0s both",
          }}
        >
          <span style={{ display: "block", color: "var(--ink)" }}>{titleLead}</span>
          <span style={{ display: "block", color: "var(--quiet)" }}>{titleTail}</span>
        </h1>

        <section
          style={{
            position: "relative",
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "18px 0",
          }}
        >
          <div
            className="sm-a"
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              top: "42%",
              width: 420,
              height: 420,
              borderRadius: "50%",
              background:
                "radial-gradient(closest-side,rgba(244,81,30,.16),rgba(244,81,30,0))",
              animation: "smBreath 4.2s ease-in-out infinite both",
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative", width: 300, height: 300 }}>
            <div style={{ position: "absolute", inset: 0 }}>
              <ProgressRing progress={progress} />
            </div>
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%,-50%)",
              }}
            >
              <WorkingMark status={status} />
            </div>
          </div>

          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "flex-end",
              gap: 10,
              marginTop: 22,
              color: "var(--ink)",
            }}
          >
            <DotMatrixValue value={timerValue} ariaLabel={timerAria} />
            <span
              className="qmono"
              style={{ color: "var(--quiet)", paddingBottom: 2 }}
            >
              {timerUnit}
            </span>
          </div>

          <div
            role="list"
            aria-label="Session stages"
            style={{
              position: "relative",
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 18,
              marginTop: 20,
              padding: "0 22px",
            }}
          >
            {steps.map((step, i) => {
              const isCurrent = i === currentStepIndex && status !== "done";
              const isQueued = i > currentStepIndex && step.status === "queued";
              return (
                <span
                  key={step.id}
                  role="listitem"
                  aria-current={isCurrent ? "step" : undefined}
                  className="qmono"
                  style={{
                    color: isCurrent ? "var(--ink)" : "var(--quiet)",
                    opacity: isQueued ? 0.5 : 1,
                  }}
                >
                  {step.name}
                </span>
              );
            })}
          </div>
        </section>

        {/* Stop confirmation banner */}
        {showStopConfirm && (
          <div
            role="region"
            aria-label="Stop session confirmation"
            className="qcard"
            style={{
              margin: "0 22px 14px",
              padding: "16px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div>
              <strong
                style={{
                  display: "block",
                  fontFamily: "var(--disp)",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--ink)",
                }}
              >
                Stop this session?
              </strong>
              <span style={{ fontSize: 13, color: "var(--quiet)" }}>
                Sutaeru keeps what it found so far
              </span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="qtap"
                onClick={onKeepWorking}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 22,
                  border: "1px solid var(--stroke)",
                  background: "var(--card)",
                  color: "var(--ink)",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                Keep working
              </button>
              <button
                type="button"
                className="qtap"
                onClick={onConfirmStop || onStop}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 22,
                  border: 0,
                  background: "#F4511E",
                  color: "#FFFFFF",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                Stop
              </button>
            </div>
          </div>
        )}

        {/* Stopped status banner */}
        {status === "stopped" && !showStopConfirm && (
          <div
            role="status"
            className="qcard"
            style={{
              margin: "0 22px 14px",
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <strong
                style={{
                  display: "block",
                  fontFamily: "var(--disp)",
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--ink)",
                }}
              >
                Stopped at {Math.round(Math.max(0, Math.min(1, progress)) * 100)}%.
              </strong>
              <span style={{ fontSize: 12.5, color: "var(--quiet)" }}>
                What Sutaeru found so far is kept
              </span>
            </div>
            <button
              type="button"
              className="qtap"
              onClick={onResume}
              style={{
                minHeight: 44,
                padding: "0 18px",
                borderRadius: 22,
                border: 0,
                background: "var(--ink)",
                color: "var(--bg)",
                fontFamily: "var(--disp)",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              Resume
            </button>
          </div>
        )}

        {/* Error state banner */}
        {status === "error" && (
          <div
            role="alert"
            className="qcard"
            style={{
              margin: "0 22px 14px",
              padding: "16px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div>
              <strong
                style={{
                  display: "block",
                  fontFamily: "var(--disp)",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--ink)",
                }}
              >
                Session interrupted
              </strong>
              <span style={{ fontSize: 13, color: "var(--quiet)" }}>
                {resolvedErrorMessage}
              </span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="qtap"
                onClick={onResume}
                style={{
                  minHeight: 44,
                  padding: "0 20px",
                  borderRadius: 22,
                  border: 0,
                  background: "#F4511E",
                  color: "#FFFFFF",
                  fontFamily: "var(--disp)",
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Pending tool approvals (preserved from Chat.tsx SSE stream) */}
        {approvals && approvals.length > 0 && (
          <div style={{ margin: "0 22px 14px" }}>
            {approvals.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                onDecision={onApprovalDecision}
              />
            ))}
          </div>
        )}

        {/* Expandable More / Details drawer */}
        {moreOpen && (
          <div
            role="region"
            aria-label="Session details"
            className="qcard"
            style={{
              margin: "0 22px 14px",
              padding: "16px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span className="qmono" style={{ color: "var(--quiet)" }}>
                Steps ({Math.min(currentStepIndex + 1, steps.length)} of {steps.length})
              </span>
              <span className="qmono" style={{ color: "var(--quiet)" }}>
                Elapsed {formatDuration(elapsedMs)}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {steps.map((step, idx) => (
                <div
                  key={step.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 8,
                    fontSize: 13.5,
                    color: idx === currentStepIndex ? "var(--ink)" : "var(--quiet)",
                  }}
                >
                  <span style={{ fontWeight: idx === currentStepIndex ? 600 : 400 }}>
                    {step.name}
                    {step.detail ? ` · ${step.detail}` : ""}
                  </span>
                  <span className="qmono" style={{ fontSize: 10 }}>
                    {step.status}
                  </span>
                </div>
              ))}
            </div>
            {draft && (
              <div
                style={{
                  borderTop: "1px solid var(--stroke)",
                  paddingTop: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <span className="qmono" style={{ color: "var(--quiet)" }}>
                  {draft.eyebrow}
                </span>
                <strong style={{ fontFamily: "var(--disp)", fontSize: 15 }}>
                  {draft.title}
                </strong>
                <p style={{ margin: 0, fontSize: 13, color: "var(--quiet)" }}>
                  {draft.lede}
                </p>
              </div>
            )}
            {onSkipDemo && status !== "done" && (
              <button
                type="button"
                className="qtap qmono"
                onClick={onSkipDemo}
                style={{
                  alignSelf: "flex-start",
                  minHeight: 44,
                  padding: "0 14px",
                  borderRadius: 22,
                  border: "1px solid var(--stroke)",
                  background: "var(--card)",
                  color: "var(--ink)",
                }}
              >
                Demo · skip ahead
              </button>
            )}
          </div>
        )}

        {/* Expandable Add a note composer */}
        {noteOpen && (
          <form
            onSubmit={handleNoteSubmit}
            className="qbar"
            style={{
              margin: "0 22px 12px",
              padding: "6px 6px 6px 18px",
              borderRadius: 28,
              background: "var(--card)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <input
              ref={noteInputRef}
              type="text"
              aria-label="Message Sutaeru"
              placeholder="Message Sutaeru while it works"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              style={{
                flex: 1,
                minWidth: 0,
                border: 0,
                outline: 0,
                background: "transparent",
                fontSize: 15,
                color: "var(--ink)",
                fontFamily: "var(--body)",
              }}
            />
            <button
              type="submit"
              className="qtap"
              aria-label="Send"
              style={{
                flex: "none",
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: 0,
                background: "var(--ink)",
                color: "var(--bg)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
        )}

        {/* Bottom 3-button control bar matching Session.dc.html */}
        <div
          style={{
            flex: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 28px 34px",
          }}
        >
          <button
            type="button"
            className="qtap"
            aria-label="Cancel"
            onClick={onStop}
            style={{
              flex: "none",
              display: "grid",
              placeItems: "center",
              width: 56,
              height: 56,
              borderRadius: "50%",
              border: 0,
              background: "var(--panel)",
              color: "var(--ink)",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          <button
            type="button"
            className="qtap"
            aria-label={primaryAriaLabel}
            onClick={handlePrimaryAction}
            style={{
              flex: "none",
              display: "grid",
              placeItems: "center",
              width: 72,
              height: 72,
              borderRadius: "50%",
              border: 0,
              background: "#F4511E",
              color: "#fff",
              boxShadow: "0 18px 36px -14px rgba(244,81,30,.7)",
            }}
          >
            {status === "stopped" || status === "error" ? (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 5.5v13l11-6.5-11-6.5z" />
              </svg>
            ) : status === "done" ? (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12l5 5L20 7" />
              </svg>
            ) : (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="6" y="5" width="4" height="14" rx="1.5" />
                <rect x="14" y="5" width="4" height="14" rx="1.5" />
              </svg>
            )}
          </button>

          <button
            type="button"
            className="qtap"
            aria-label="Add a note"
            aria-expanded={noteOpen}
            onClick={handleToggleNote}
            style={{
              flex: "none",
              display: "grid",
              placeItems: "center",
              width: 56,
              height: 56,
              borderRadius: "50%",
              border: 0,
              background: "var(--panel)",
              color: "var(--ink)",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 5h14v10l-4 4H5z" />
              <path d="M15 19v-4h4" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default SessionView;