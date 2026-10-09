import * as React from "react";
import { useState } from "react";
import { FocusBrackets, Sheet, Toggle } from "@/components/art";
import { SutaeruIcon, type SutaeruIconName } from "@/components/SutaeruIcon";
import { cn } from "@/lib/utils";

/** One chat mode as the composer chip and the mode sheet show it. */
export interface ChatModeOption {
  key: string;
  label: string;
  /** What the chip says when the tools row is too narrow for `label`. */
  short?: string;
  text: string;
  icon: SutaeruIconName;
  adminOnly?: boolean;
}

/** The five modes. Code mode is the admin's Claude Code thread and only shows for admins. */
export const CHAT_MODES: ChatModeOption[] = [
  { key: "fast", label: "Fast", text: "Quick answers, with search", icon: "ask" },
  { key: "deep", label: "Deep research", short: "Research", text: "Browse, read and verify", icon: "research" },
  { key: "image", label: "Image", text: "Draw from a description", icon: "image" },
  { key: "document", label: "Document", text: "Make files and reports", icon: "report" },
  { key: "code", label: "Code", text: "Work on your server", icon: "code", adminOnly: true },
];

export function chatModes(isAdmin: boolean): ChatModeOption[] {
  return CHAT_MODES.filter((mode) => !mode.adminOnly || isAdmin);
}

export function chatMode(key: string): ChatModeOption {
  return CHAT_MODES.find((mode) => mode.key === key) ?? CHAT_MODES[0];
}

/** A source the chat may search, bound to one real tool id. */
export interface ModeSourceRow {
  /** The tool id this switch turns on and off in the thread settings. */
  id: string;
  label: string;
  caption: string;
}

/**
 * The sources the composer offers, bound to tool ids the engine really has. The
 * prototype's third row is Memory; the API has no per-chat memory switch, so that row is
 * the `browse` tool.
 */
export const SOURCE_ROWS: ModeSourceRow[] = [
  { id: "web_search", label: "Web", caption: "News, papers and public sites" },
  { id: "safe_files", label: "My files", caption: "Everything in Files" },
  { id: "browse", label: "Browse", caption: "Pages opened and read in full" },
];

/** The promise the private switch makes is one no endpoint keeps yet, so the button says this instead. */
export const PRIVATE_HINT = "Private chats are not available yet.";

export interface ModeMenuProps {
  mode: string;
  modes: ChatModeOption[];
  onModeChange(key: string): void;
  /** The thread's real tool allowlist, which the Search in switches change. */
  allowedTools: string[];
  onToggleTool(id: string): void;
  sourceRows: ModeSourceRow[];
  /** The slower, more careful run the stream endpoint reads off the body. Omit to hide the row. */
  thinking?: boolean;
  onThinkingChange?(next: boolean): void;
  /** Opens the thread's run settings (model, tools, skills). Omit to hide the row. */
  onOpenSettings?(): void;
  /** The lab shows the sheet open as a state. */
  initialOpen?: boolean;
}

/**
 * The composer's mode chip and the sheet it opens. The chip shows the current mode's
 * icon and name and never clips: a narrow tools row swaps in the short name (a
 * container query in composer.css). The sheet holds the modes, the Search in sources
 * (the globe pill that used to crowd the tools row), Thinking and Run settings.
 */
export function ModeMenu({
  mode,
  modes,
  onModeChange,
  allowedTools,
  onToggleTool,
  sourceRows,
  thinking,
  onThinkingChange,
  onOpenSettings,
  initialOpen = false,
}: ModeMenuProps) {
  const [open, setOpen] = useState(initialOpen);
  const current = chatMode(mode);
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        className="pill mode-chip"
        id="modeBtn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Mode: ${current.label}. Change mode and sources`}
        onClick={() => setOpen((value) => !value)}
      >
        <SutaeruIcon name={current.icon} signal={false} className="ico" />
        <span className="mode-chip-name" aria-hidden="true">
          <span className="full">{current.label}</span>
          <span className="short">{current.short ?? current.label}</span>
        </span>
        <svg className="mode-chip-chev" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="M3 4.5L6 7.5L9 4.5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <Sheet open={open} onClose={close} title="Mode" className="mode-sheet">
        <ModeMenuBody
          mode={mode}
          modes={modes}
          onModeChange={(key) => { onModeChange(key); close(); }}
          allowedTools={allowedTools}
          onToggleTool={onToggleTool}
          sourceRows={sourceRows}
          thinking={thinking}
          onThinkingChange={onThinkingChange}
          onOpenSettings={onOpenSettings ? () => { close(); onOpenSettings(); } : undefined}
        />
        <button type="button" className="btn ink big sheet-done" onClick={close}>Done</button>
      </Sheet>
    </>
  );
}

/** The sheet's content, exported on its own for the lab and the tests. */
export function ModeMenuBody({
  mode,
  modes,
  onModeChange,
  allowedTools,
  onToggleTool,
  sourceRows,
  thinking,
  onThinkingChange,
  onOpenSettings,
}: Omit<ModeMenuProps, "initialOpen">) {
  return (
    <div className="mode-menu">
      <div className="mode-grid" role="radiogroup" aria-label="Chat mode">
        {modes.map((option) => {
          const active = option.key === mode;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={active}
              className={cn("mode-card", active && "is-active")}
              onClick={() => onModeChange(option.key)}
            >
              {active && <FocusBrackets />}
              <SutaeruIcon name={option.icon} signal className="mode-card-icon" />
              <span className="mode-card-title">{option.label}</span>
              <span className="mode-card-text">{option.text}</span>
            </button>
          );
        })}
      </div>

      <p className="mono mode-menu-label">Search in</p>
      <div className="pop-toggles" role="group" aria-label="Search in">
        {sourceRows.map((row) => (
          <div className="toggle-row" key={row.id}>
            <div className="tx"><b>{row.label}</b><small>{row.caption}</small></div>
            <Toggle checked={allowedTools.includes(row.id)} onCheckedChange={() => onToggleTool(row.id)} label={row.label} />
          </div>
        ))}
        {onThinkingChange && (
          <div className="toggle-row">
            <div className="tx"><b>Thinking</b><small>Slower, more careful answers</small></div>
            <Toggle checked={!!thinking} onCheckedChange={(next) => onThinkingChange(next)} label="Thinking" />
          </div>
        )}
      </div>

      {onOpenSettings && (
        <button type="button" className="pop-item mode-settings" onClick={onOpenSettings}>
          <span className="pi"><SutaeruIcon name="settings" signal={false} className="ico" /></span>
          <span><b>Run settings</b><small>Model, tools and skills for this thread</small></span>
        </button>
      )}
    </div>
  );
}
