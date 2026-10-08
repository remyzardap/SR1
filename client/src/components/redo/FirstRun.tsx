import { SutaeruGlyph, SutaeruSeal } from "@/components/brand";

export const FIRST_RUN_TITLE = "Welcome to Sutaeru";
export const FIRST_RUN_DISMISS_LABEL = "Start asking";

export const FIRST_RUN_CARDS = [
  "Search the web with sources you can click.",
  "Deep research that reads dozens of pages and writes a cited report.",
  "Agents that browse, write and file while you’re away.",
];

export interface FirstRunProps {
  onDismiss: () => void;
  className?: string;
}

export function FirstRun({ onDismiss, className }: FirstRunProps) {
  return (
    <div className={`sr-first-run ${className || ""}`} role="dialog" aria-modal="true" aria-labelledby="sr-first-run-title">
      <section className="sr-first-run-card">
        <SutaeruGlyph detail="compact" size={48} className="sr-first-run-mark" />
        <h1 id="sr-first-run-title" className="sr-first-run-title">{FIRST_RUN_TITLE}</h1>
        <ul className="sr-first-run-list">
          {FIRST_RUN_CARDS.map((line, index) => (
            <li key={index} className="sr-first-run-item">{line}</li>
          ))}
        </ul>
        <button
          type="button"
          className="sr-first-run-done btn ink big"
          data-testid="button-first-run-done"
          autoFocus
          onClick={onDismiss}
        >
          {FIRST_RUN_DISMISS_LABEL}
        </button>
      </section>
    </div>
  );
}

export default FirstRun;