import * as React from "react";
import { useRef, useState } from "react";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { ModeSheet, type ChatModeOption, type ModeSheetBodyProps, type ModeSourceRow } from "./ModeSheet";

export type { ChatModeOption, ModeSourceRow };

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

/**
 * The sources the sheet offers, bound to tool ids the engine really has: the web search, the
 * person's files and their Google Drive (the `drive_search` tool). Browsing pages is a tool pill.
 */
export const SOURCE_ROWS: ModeSourceRow[] = [
  { id: "web_search", label: "Web", caption: "News, papers and public sites" },
  { id: "safe_files", label: "My files", caption: "Everything in Files" },
  { id: "drive_search", label: "Drive", caption: "Your Google Drive" },
];

/** The promise the private switch makes is one no endpoint keeps yet, so Home's button says this instead. */
export const PRIVATE_HINT = "Private chats are not available yet.";

export interface ModeMenuProps extends Omit<ModeSheetBodyProps, "foldKey"> {
  /** Kept for callers that still pass it; the sheet has no run-settings row any more. */
  onOpenSettings?(): void;
  /** The lab shows the sheet open as a state. */
  initialOpen?: boolean;
  /** Fold memory key for the sheet; one per page. */
  foldKey?: string;
}

/**
 * The composer's mode chip and the sheet it opens (ModeSheet). The chip shows the current mode's
 * icon and name and never clips: a narrow tools row swaps in the short name (a container query in
 * composer.css).
 */
export function ModeMenu({ initialOpen = false, onOpenSettings: _unused, ...sheet }: ModeMenuProps) {
  const [open, setOpen] = useState(initialOpen);
  const chip = useRef<HTMLButtonElement>(null);
  const current = chatMode(sheet.mode);

  return (
    <>
      <button
        ref={chip}
        type="button"
        className="pill mode-chip"
        id="modeBtn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Mode: ${current.label}. Change mode, model and sources`}
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
      <ModeSheet open={open} onClose={() => setOpen(false)} anchor={chip} {...sheet} />
    </>
  );
}
