import type { VoicePhase } from "@/hooks/useVoiceDictation";

export interface VoiceScreenProps {
  phase: VoicePhase;
  listening: boolean;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
  onTypeInstead: () => void;
  onShowResult: () => void;
  hintText?: string;
  hintSuffix?: string;
  transcript?: string;
}

const BAR_COUNT = 48;
const BAR_HEIGHT = 24;

function makeBars(phase: VoicePhase) {
  const boxes: Array<{ key: number; x: number; y: number }> = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    boxes.push({ key: i, x: 0, y: i * 28 });
  }
  return boxes;
}

const BAR_SVG_W = 24;
const BAR_SVG_H = BAR_COUNT * 28;

function vxlDelay(index: number, total: number): string {
  const t = (index / total) * 2.4;
  return `${t}s`;
}

function vxlDuration(index: number, total: number): string {
  return `${2.4}s`;
}

export function VoiceScreen({
  phase,
  listening,
  busy,
  onStart,
  onStop,
  onTypeInstead,
  onShowResult,
  hintText = "Plan my week around",
  hintSuffix = "Friday…",
  transcript = "",
}: VoiceScreenProps) {
  const bars = makeBars(phase);
  const isIdle = phase === "idle";
  const isRecording = phase === "recording";
  const isTranscribing = phase === "transcribing";

  const btnLabel = isIdle ? "Tap to speak" : isRecording ? "Speaking, tap to stop" : "Transcribing…";

  return (
    <div className="sk-page vc-page">
      <header className="sk-header vc-header">
        <div className="vc-title-group">
          <h1 className="vc-title">
            <span className="vc-title-main">Voice</span>
            <span className="vc-title-sub">{listening ? "Listening" : isTranscribing ? "Thinking…" : "Ready"}</span>
          </h1>
        </div>
      </header>

      <section className="vc-waveform" role="status" aria-live="polite" aria-label={listening ? "Listening for speech" : "Voice dictation"}>
        <svg
          role="img"
          aria-label={listening ? "Listening" : "Voice input"}
          width="360"
          height={BAR_SVG_H}
          viewBox={`0 0 360 ${BAR_SVG_H}`}
          style={{ display: "block" }}
        >
          {bars.map((bar) => (
            <g key={bar.key}>
              <rect x="0" y={bar.y} width={BAR_SVG_W} height={BAR_SVG_W} rx="5" fill="var(--panel)" />
              {listening && (
                <rect
                  className="vxl"
                  x="0"
                  y={bar.y}
                  width={BAR_SVG_W}
                  height={BAR_SVG_W}
                  rx="5"
                  fill="var(--accent)"
                  style={{
                    animation: listening ? `vxBar ${vxlDuration(bar.key, BAR_COUNT)} steps(1,end) infinite` : "none",
                    animationDelay: vxlDelay(bar.key, BAR_COUNT),
                    fillOpacity: 0,
                  }}
                />
              )}
            </g>
          ))}
          <style>{`
            @keyframes vxBar {
              0%, 12.5% { fill-opacity: 0 }
              25%, 37.5% { fill-opacity: 1 }
              50%, 62.5% { fill-opacity: 0 }
              75%, 87.5% { fill-opacity: 1 }
              100% { fill-opacity: 0 }
            }
            @media (prefers-reduced-motion: reduce) {
              .vxl { animation: none !important; fill-opacity: 0 }
            }
          `}</style>
        </svg>
      </section>

      {transcript ? (
        <p className="vc-hint">
          <span className="vc-hint-ink">{transcript}</span>
        </p>
      ) : (
        <p className="vc-hint">
          <span className="vc-hint-ink">{hintText}</span> <span className="vc-hint-quiet">{hintSuffix}</span>
        </p>
      )}

      <div className="vc-controls">
        <button
          type="button"
          className="vc-btn-circle qtap"
          aria-label="Type instead"
          onClick={onTypeInstead}
          disabled={busy}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="6" width="18" height="12" rx="3" />
            <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
          </svg>
        </button>

        <button
          type="button"
          className={`vc-btn-speak qtap${isIdle ? " is-idle" : ""}${isRecording ? " is-recording" : ""}${isTranscribing ? " is-transcribing" : ""}`}
          aria-label={btnLabel}
          onClick={isRecording ? onStop : onStart}
          disabled={isTranscribing}
        >
          {isIdle && <span aria-hidden="true" className="vc-btn-speak-dither" />}
          <span className="vc-btn-speak-text">
            {isIdle ? "Tap to speak" : isRecording ? "Stop" : "Transcribing…"}
          </span>
        </button>

        <button
          type="button"
          className="vc-btn-circle qtap"
          aria-label="Show it"
          onClick={onShowResult}
          disabled={!transcript}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="6" width="18" height="13" rx="3" />
            <circle cx="12" cy="12.5" r="3.5" />
            <path d="M8 6l1.5-2h5L16 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default VoiceScreen;
