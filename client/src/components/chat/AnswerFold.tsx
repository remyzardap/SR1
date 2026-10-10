import * as React from "react";
import { useEffect, useId, useState, type ReactNode } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import "./modeSheet.css";

/** Fired by a citation chip before it scrolls, so a folded Sources panel can open first. */
export const CITE_EVENT = "sutaeru:cite";

export interface AnswerFoldProps {
  /** Mono label, e.g. "Sources". */
  label: string;
  /** One line shown while folded, e.g. "4 · nature.com, who.int". */
  summary?: ReactNode;
  /** A small icon before the label. */
  icon?: ReactNode;
  defaultOpen?: boolean;
  /** Open when a citation whose anchor starts with this prefix is tapped (e.g. `src-<messageId>-`). */
  opensForCitation?: string;
  className?: string;
  children: ReactNode;
}

const Chevron = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/**
 * A one-line panel that unfolds: label, a quiet summary of what is inside, a chevron. The whole row
 * is the button (aria-expanded). Used for the answer's Sources, Thinking and Turn this into.
 */
export function AnswerFold({ label, summary, icon, defaultOpen = false, opensForCitation, className, children }: AnswerFoldProps) {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();

  useEffect(() => {
    if (!opensForCitation) return;
    const onCite = (event: Event) => {
      const anchor = (event as CustomEvent<string>).detail;
      if (typeof anchor === "string" && anchor.startsWith(opensForCitation)) setOpen(true);
    };
    window.addEventListener(CITE_EVENT, onCite);
    return () => window.removeEventListener(CITE_EVENT, onCite);
  }, [opensForCitation]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("afold", className)}>
      <CollapsibleTrigger className="afold-btn" aria-controls={regionId}>
        {icon ? <span className="afold-ico" aria-hidden="true">{icon}</span> : null}
        <span className="mono ink afold-lbl">{label}</span>
        {summary ? <span className="afold-sum">{summary}</span> : <span className="afold-sum" />}
        <span className="afold-chev" aria-hidden="true"><Chevron /></span>
      </CollapsibleTrigger>
      <CollapsibleContent id={regionId} className="fold-b" role="region" aria-label={label}>
        <div className="afold-bi">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
