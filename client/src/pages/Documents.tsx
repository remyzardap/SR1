import { useCallback, useState, type ReactNode } from "react";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import AtelierGuided from "./AtelierGuided";
import QuickCreate from "./QuickCreate";
import { PageTitle } from "@/components/chrome/PageTitle";
import { FocusBrackets } from "@/components/art";
import "@/styles/documents-start.css";

type Start = "new" | "edit" | null;
type Mode = "describe" | "interview";

function readParams(): { start: Start; mode: Mode } {
  if (typeof window === "undefined") return { start: null, mode: "describe" };
  const p = new URLSearchParams(window.location.search);
  const mode: Mode = p.get("mode") === "interview" ? "interview" : "describe";
  const s = p.get("start");
  // Older links only carried ?mode=, which always meant making a new document.
  const start: Start = s === "new" || s === "edit" ? s : p.get("mode") ? "new" : null;
  return { start, mode };
}

/** Small illustrations for the option cards. They use the page tokens, so they follow light and dark. */
const art: Record<string, ReactNode> = {
  new: (
    <svg viewBox="0 0 240 150" aria-hidden="true">
      <rect x="78" y="14" width="84" height="116" rx="10" className="a-paper" />
      <path d="M92 44h56M92 58h56M92 72h38" className="a-line" />
      <circle cx="170" cy="40" r="22" className="a-spot" />
      <path d="M170 28v24M158 40h24" className="a-plus" />
    </svg>
  ),
  edit: (
    <svg viewBox="0 0 240 150" aria-hidden="true">
      <rect x="70" y="14" width="84" height="116" rx="10" className="a-paper" />
      <path d="M84 44h56M84 72h56M84 86h30" className="a-line" />
      <rect x="82" y="52" width="60" height="14" rx="4" className="a-mark" />
      <path d="M176 38l22 22-48 48-26 4 4-26z" className="a-pen" />
    </svg>
  ),
  describe: (
    <svg viewBox="0 0 240 150" aria-hidden="true">
      <rect x="22" y="28" width="92" height="56" rx="16" className="a-paper" />
      <path d="M40 48h56M40 62h38" className="a-line" />
      <path d="M118 56h26" className="a-line" />
      <path d="M138 48l8 8-8 8" className="a-line" />
      <rect x="152" y="22" width="68" height="94" rx="9" className="a-paper" />
      <path d="M164 46h44M164 60h44M164 74h28" className="a-line" />
    </svg>
  ),
  interview: (
    <svg viewBox="0 0 240 150" aria-hidden="true">
      <rect x="22" y="24" width="112" height="42" rx="16" className="a-paper" />
      <path d="M40 45h72" className="a-line" />
      <rect x="106" y="78" width="112" height="42" rx="16" className="a-spot" />
      <path d="M124 99h76" className="a-line a-line-light" />
    </svg>
  ),
};

function OptionCard({ id, title, text, label, active, onClick, compact }: { id: string; title: string; text: string; label: string; active?: boolean; onClick: () => void; compact?: boolean }) {
  return (
    <span className="sk-doc-cell">
      <button type="button" role="radio" aria-checked={!!active} className={`sk-doc-card${compact ? " is-compact" : ""}`} onClick={onClick}>
        <span className="sk-doc-art">{art[id]}</span>
        <span className="sk-doc-body">
          <span className="sk-doc-label">{label}</span>
          <span className="sk-doc-title">{title}</span>
          <span className="sk-doc-text">{text}</span>
        </span>
      </button>
      {active ? <FocusBrackets /> : null}
    </span>
  );
}

/**
 * Documents: one place to make and change finished files. The first screen asks the one question that
 * matters, new or existing, with the two options shown as illustrated cards.
 * (This page was called Atelier; the /atelier address still works and lands here.)
 */
export default function Documents() {
  useSeoMeta({ title: "Documents", path: "/documents" });
  const initial = readParams();
  const [start, setStartState] = useState<Start>(initial.start);
  const [mode, setModeState] = useState<Mode>(initial.mode);

  const sync = useCallback((nextStart: Start, nextMode: Mode) => {
    const url = new URL(window.location.href);
    url.search = "";
    if (nextStart) url.searchParams.set("start", nextStart);
    if (nextStart === "new") url.searchParams.set("mode", nextMode);
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);

  const setStart = (next: Start) => { setStartState(next); sync(next, mode); };
  const setMode = (next: Mode) => { setModeState(next); sync("new", next); };

  if (!start) {
    return (
      <div className="sk-page sk-documents">
        <div className="sk-header">
          <div>
            <PageTitle className="skx-title-flush">Documents</PageTitle>
            <p className="sk-sub">What do you want to do?</p>
          </div>
        </div>
        <div className="sk-doc-grid" role="radiogroup" aria-label="Start a document">
          <OptionCard id="new" label="New document" title="Start from an idea" text="Describe what you need, or let Kemma interview you. You get a finished file." onClick={() => setStart("new")} />
          <OptionCard id="edit" label="Edit document" title="Start from a file" text="Upload a PDF, Word file or notes, then rewrite it or reformat it." onClick={() => setStart("edit")} />
        </div>
      </div>
    );
  }

  return (
    <div className="sk-page sk-documents">
      <div className="sk-header">
        <div>
          <button type="button" className="sk-doc-back" onClick={() => setStart(null)}>← All documents</button>
          <PageTitle className="skx-title-flush">{start === "new" ? "New document" : "Edit document"}</PageTitle>
          <p className="sk-sub">{start === "new" ? "How do you want to start?" : "Upload the file you want to change."}</p>
        </div>
      </div>
      {start === "new" ? (
        <>
          <div className="sk-doc-grid is-compact" role="radiogroup" aria-label="How do you want to start?">
            <OptionCard compact id="describe" label="Quick" title="Describe it" text="Say what you want. Pick a format and style." active={mode === "describe"} onClick={() => setMode("describe")} />
            <OptionCard compact id="interview" label="Guided" title="Interview me" text="Kemma asks the questions, then builds it." active={mode === "interview"} onClick={() => setMode("interview")} />
          </div>
          {mode === "describe" ? <QuickCreate embedded /> : <AtelierGuided embedded entry="new" />}
        </>
      ) : (
        <AtelierGuided embedded entry="edit" />
      )}
    </div>
  );
}
