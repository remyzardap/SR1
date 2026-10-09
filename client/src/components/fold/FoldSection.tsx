import * as React from "react";
import { useId, useState, type ReactNode } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useFoldGroup } from "./FoldGroup";
import { Pic, type Art } from "./Pic";

export interface FoldSectionProps {
  /** Stable id; inside a FoldGroup it is the key in the page's fold state. */
  id: string;
  /** Mono label, e.g. "Shot". */
  label: string;
  /** Position on the page, shown as a mono "01". */
  index?: number;
  /** The current pick in plain words; one line, ellipsis when long. */
  pick?: ReactNode;
  /** 42x32 mini picture of the pick, shown while folded: an image url or a drawn node. */
  mini?: Art;
  /** Controlled open state; overrides the group. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Uncontrolled default, outside a group. */
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}

const Chevron = () => (
  <svg className="fi"viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/**
 * One folding option group. Folded it is a single 60 px row: number, label, the pick in words,
 * a mini picture of the pick and a chevron. The whole row is the button (aria-expanded,
 * Enter and Space toggle). The body animates its height; instant under reduced motion.
 */
export function FoldSection({ id, label, index, pick, mini, open, onOpenChange, defaultOpen = false, className, children }: FoldSectionProps) {
  const group = useFoldGroup();
  const [own, setOwn] = useState(defaultOpen);
  const headId = `fold-h${useId().replace(/:/g, "")}`;
  const isOpen = open ?? (group ? group.isOpen(id) : own);
  const change = (next: boolean) => {
    onOpenChange?.(next);
    if (open !== undefined) return;
    if (group) group.setOpen(id, next);
    else setOwn(next);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={change} className={cn("fold", className)} data-fold={id}>
      <h3 className="fold-h">
        <CollapsibleTrigger className="fold-trigger" id={headId}>
          <span className="fold-lbl">
            {index !== undefined && <span className="fold-n" aria-hidden="true">{String(index).padStart(2, "0")}</span>}
            <span className="mono ink">{label}</span>
          </span>
          <span className="fold-val">
            {pick !== undefined && pick !== null && <span className="fold-pick">{pick}</span>}
            {mini !== undefined && mini !== null && (
              <span className="fold-mini" aria-hidden="true">
                <Pic art={mini} />
              </span>
            )}
          </span>
          <span className="fold-chev" aria-hidden="true">
            <Chevron />
          </span>
        </CollapsibleTrigger>
      </h3>
      <CollapsibleContent className="fold-b" role="region" aria-labelledby={headId}>
        <div className="fold-bi">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
