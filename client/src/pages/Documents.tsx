import { useState, type ReactNode } from "react";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import NewDocument from "./NewDocument";
import EditDocument from "./EditDocument";
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
};

function OptionCard({ id, title, text, label, active, onClick }: { id: string; title: string; text: string; label: string; active?: boolean; onClick: () => void }) {
  return (
    <span className="sk-doc-cell">
      <button type="button" role="radio" aria-checked={!!active} className="sk-doc-card" onClick={onClick}>
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
  const [start, setStart] = useState<Start>(initial.start);

  const sync = (next: Start) => {
    const url = new URL(window.location.href);
    url.search = "";
    if (next) url.searchParams.set("start", next);
    window.history.replaceState(null, "", url.pathname + url.search);
  };

  const setStartBoth = (next: Start) => { setStart(next); sync(next); };

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
          <OptionCard id="new" label="New document" title="Start from an idea" text="Describe what you need, or let Sutaeru interview you. You get a finished file." onClick={() => setStartBoth("new")} />
          <OptionCard id="edit" label="Edit document" title="Start from a file" text="Upload a PDF, Word file or notes, then rewrite it or reformat it." onClick={() => setStartBoth("edit")} />
        </div>
      </div>
    );
  }

  return (
    <div className="sk-page sk-documents">
      <div className="sk-header">
        <div>
          <button type="button" className="sk-doc-back" onClick={() => setStartBoth(null)}>← All documents</button>
          <PageTitle className="skx-title-flush">{start === "new" ? "New document" : "Edit document"}</PageTitle>
          <p className="sk-sub">{start === "new" ? "Describe it, pick a kind, add what it should read." : "Upload the file you want to change."}</p>
        </div>
      </div>
      {start === "new" ? (
        <NewDocument startInInterview={initial.mode === "interview"} />
      ) : (
        <EditDocument embedded onBack={() => setStartBoth(null)} />
      )}
    </div>
  );
}
