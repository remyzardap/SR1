import * as React from "react";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { FocusBrackets, Sheet, Toggle } from "@/components/art";
import { SutaeruIcon, type SutaeruIconName } from "@/components/SutaeruIcon";
import { MAX_MB } from "@/lib/attachments";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { CanvasBar } from "./Bar";
import { useUploadRamp } from "./useUploadRamp";

/** One file in the composer, already read or still being read. */
export interface HomeAttachmentRow {
  id: string;
  name: string;
  /** FormatBytes output once it is on disk, e.g. "2.4 MB". */
  meta: string;
  /** Which glyph the thumb shows when the file is not a photo. */
  icon: SutaeruIconName;
  /** A photo shows the picture itself instead of a glyph. */
  preview?: string;
  /** Set while the browser is still reading the file; the bar climbs from here. */
  startedAt?: number | null;
}

/** A source the chat may search, bound to one real tool id. */
export interface HomeSourceRow {
  /** The tool id this switch turns on and off in the thread settings. */
  id: string;
  label: string;
  caption: string;
}

export interface HomeComposerProps {
  value: string;
  onChange(next: string): void;
  /** A real send: what happens next belongs to the page. */
  onSubmit(text: string): void;
  /** The send button with nothing in it is the mic, as it is in the prototype. */
  onListen(): void;
  onStopListen(): void;
  listening: boolean;
  /** Offline keeps the composer usable; the question waits on the screen. */
  offline: boolean;
  thinking: boolean;
  onThinkingChange(next: boolean): void;
  privateChat: boolean;
  onPrivateChange(next: boolean): void;
  /** The thread's real tool allowlist. */
  allowedTools: string[];
  onToggleTool(id: string): void;
  sourceRows: HomeSourceRow[];
  attachments: HomeAttachmentRow[];
  onAddAttachment(kind: "file" | "camera" | "drive"): void;
  onRemoveAttachment(id: string): void;
  /** The Google account behind Drive, or null when there is not one. */
  driveEmail?: string | null;
  /** Set when the product cannot do what the switch promises yet; the button says why. */
  privateHint?: string;
  /**
   * Which panel the composer opens with. The lab uses it to show a popover as a state;
   * a person clicking the button is the only way to get there on the screen itself.
   */
  initialPanel?: "attach" | "sources" | null;
  /** Every keystroke pulses the hero ramp. */
  onActivity?(): void;
}

const G_LETTER: CSSProperties = { font: "700 13px/1 var(--disp)" };

/** The Drive row's caption: the account that is really connected, or the truth that there is none. */
export function driveCaption(email: string | null | undefined): string {
  return email ? `Connected as ${email}` : "Not connected yet";
}

/**
 * The Home composer: the prototype's docked pill (design/sutaeru-app/app.js:530-544,
 * mounted at 564-685) with its canned recording, fake upload timer and sample file
 * names replaced by the real handlers the page passes in.
 */
export function HomeComposer({
  value,
  onChange,
  onSubmit,
  onListen,
  onStopListen,
  listening,
  offline,
  thinking,
  onThinkingChange,
  privateChat,
  onPrivateChange,
  allowedTools,
  onToggleTool,
  sourceRows,
  attachments,
  onAddAttachment,
  onRemoveAttachment,
  driveEmail,
  privateHint,
  initialPanel,
  onActivity,
}: HomeComposerProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const isPhone = useMediaQuery("(max-width: 759px)");
  const [pop, setPop] = useState<null | "attach" | "sources">(isPhone ? null : initialPanel ?? null);
  const [sheet, setSheet] = useState<null | "attach" | "sources">(isPhone ? initialPanel ?? null : null);

  const hasContent = value.trim().length > 0 || attachments.length > 0;
  const enabled = sourceRows.filter((row) => allowedTools.includes(row.id));
  // The prototype's own summary: Web wins the label, the rest count up.
  const srcLabel = allowedTools.includes("web_search")
    ? enabled.length > 1 ? `Web +${enabled.length - 1}` : "Web"
    : enabled.length ? `${enabled.length} sources` : "No sources";

  // grow(): auto-height up to the prototype's 220px ceiling.
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, 220)}px`;
  }, [value]);

  // A click outside the composer puts the popover away; so does Escape.
  useEffect(() => {
    if (!pop) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setPop(null);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setPop(null);
    };
    // Deferred by a task, so the click that opened it does not also close it.
    const timer = window.setTimeout(() => document.addEventListener("pointerdown", onPointerDown), 0);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pop]);

  function openKind(kind: "attach" | "sources") {
    // The prototype toggles the same kind off and swaps straight between the two.
    if (isPhone) {
      setSheet((current) => (current === kind ? null : kind));
      setPop(null);
      return;
    }
    setPop((current) => (current === kind ? null : kind));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = value.trim();
    if (!text && attachments.length === 0) {
      if (listening) onStopListen();
      else onListen();
      return;
    }
    setPop(null);
    onSubmit(text);
  }

  // Same rule as Chat's composer: Enter sends, Shift+Enter breaks the line.
  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  const attachItems = (
    <>
      <button type="button" className="pop-item" onClick={() => { onAddAttachment("file"); setPop(null); setSheet(null); }}>
        <span className="pi"><SutaeruIcon name="files" signal={false} className="ico" /></span>
        <span><b>Photos and files</b><small>PDF, images, sheets up to {MAX_MB} MB</small></span>
      </button>
      <button type="button" className="pop-item" onClick={() => { onAddAttachment("camera"); setPop(null); setSheet(null); }}>
        <span className="pi"><SutaeruIcon name="camera" signal={false} className="ico" /></span>
        <span><b>Take a photo</b><small>Snap a page, a receipt, a whiteboard</small></span>
      </button>
      <button type="button" className="pop-item" onClick={() => { onAddAttachment("drive"); setPop(null); setSheet(null); }}>
        <span className="pi"><span style={G_LETTER}>G</span></span>
        <span><b>From Google Drive</b><small>{driveCaption(driveEmail)}</small></span>
      </button>
    </>
  );

  const sourceItems = (
    <>
      <div className="pop-toggles">
        {sourceRows.map((row) => (
          <div className="toggle-row" key={row.id}>
            <div className="tx"><b>{row.label}</b><small>{row.caption}</small></div>
            <Toggle checked={allowedTools.includes(row.id)} onCheckedChange={() => onToggleTool(row.id)} label={row.label} />
          </div>
        ))}
      </div>
      {sheet && <button type="button" className="btn ink big sheet-done" onClick={() => setSheet(null)}>Done</button>}
    </>
  );

  return (
    <>
      <p className="private-note mono" id="privNote">
        <SutaeruIcon name="eyeoff" signal={false} className="ico s" />
        Private · not saved to history or memory
      </p>
      <div className={cn("composer-wrap", "is-on", listening && "listening")} ref={wrapRef} id="cw">
        <FocusBrackets />
        <form className="composer dock" id="composer" autoComplete="off" onSubmit={handleSubmit} ref={formRef}>
          <div className="attachments" id="atts">
            {attachments.map((row) => (
              <AttachmentRow key={row.id} row={row} onRemove={onRemoveAttachment} />
            ))}
          </div>
          <label className="sr" htmlFor="q">Ask Sutaeru</label>
          <textarea
            id="q"
            ref={areaRef}
            rows={1}
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
              onActivity?.();
            }}
            onKeyDown={handleKeyDown}
            placeholder={offline ? "Ask now. It sends when you reconnect." : listening ? "Listening…" : "Ask anything…"}
            enterKeyHint="send"
          />
          <div className="ctrls">
            <button
              type="button"
              className="icon-btn flat"
              id="attachBtn"
              aria-label="Add photos or files"
              aria-expanded={pop === "attach" || sheet === "attach"}
              onClick={() => openKind("attach")}
            >
              <SutaeruIcon name="plus" signal={false} className="ico" />
            </button>
            <button type="button" className="pill mode-pill" id="thinkBtn" aria-pressed={thinking} onClick={() => onThinkingChange(!thinking)}>
              <SutaeruIcon name="make" signal={false} className="ico" />
              Thinking
            </button>
            <button
              type="button"
              className="pill src-pill"
              id="srcBtn"
              aria-label="Choose sources"
              aria-expanded={pop === "sources" || sheet === "sources"}
              onClick={() => openKind("sources")}
            >
              <SutaeruIcon name="web" signal={false} className="ico" />
              <span className="src-text" id="srcLabel">{srcLabel}</span>
            </button>
            <span className="spacer" />
            <button
              type="button"
              className="icon-btn flat"
              id="privBtn"
              aria-pressed={privateChat}
              aria-label="Private chat"
              aria-disabled={privateHint ? true : undefined}
              title={privateHint}
              onClick={() => onPrivateChange(!privateChat)}
            >
              <SutaeruIcon name="eyeoff" signal={false} className="ico" />
            </button>
            <button type="submit" className="icon-btn ink send" id="sendBtn" aria-label={listening ? "Stop listening" : hasContent ? "Send" : "Talk to Sutaeru"}>
              <span className="mic-ico" id="sendIco"><SutaeruIcon name={hasContent ? "up" : "wave"} signal={false} className="ico" /></span>
              <span className="voice-meter" aria-hidden="true"><i /><i /><i /><i /></span>
            </button>
          </div>
        </form>
        {pop && (
          <div className="popover" role="dialog" aria-label={pop === "attach" ? "Add to this chat" : "Sources"}>
            <p className="mono">{pop === "attach" ? "Add to this chat" : "Search in"}</p>
            {pop === "attach" ? attachItems : sourceItems}
          </div>
        )}
        <Sheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet === "attach" ? "Add to this chat" : "Search in"}>
          {sheet === "attach" ? attachItems : sourceItems}
        </Sheet>
      </div>
    </>
  );
}

/** A file chip with the prototype's upload bar under the size line. */
function AttachmentRow({ row, onRemove }: { row: HomeAttachmentRow; onRemove: (id: string) => void }) {
  const progress = useUploadRamp(row.startedAt);
  const uploading = row.startedAt != null && progress < 1;
  return (
    <div className="att" data-id={row.id}>
      <span className="att-thumb">
        {row.preview ? <img src={row.preview} alt="" /> : <SutaeruIcon name={row.icon} signal={false} className="ico" />}
      </span>
      <span className="att-meta">
        <b>{row.name}</b>
        <span className="mono">{uploading ? "Uploading" : row.meta}</span>
        {uploading && <CanvasBar progress={progress} />}
      </span>
      <button type="button" className="icon-btn" aria-label={`Remove ${row.name}`} onClick={() => onRemove(row.id)}>
        <SutaeruIcon name="close" signal={false} className="ico s" />
      </button>
    </div>
  );
}
