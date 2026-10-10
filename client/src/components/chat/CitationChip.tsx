import type { MouseEvent, ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CitationChipProps } from "@/lib/citations";
import { prefersReducedMotion } from "@/components/art/useMotion";
import { CITE_EVENT } from "./AnswerFold";

/**
 * An inline `[n]` citation, rendered by Streamdown from the `<citationchip>` nodes that
 * `createCitationPlugin` puts in the answer's hast.
 *
 * The chip links to the source card (`#src-<messageId>-<n>`) and scrolls to it rather than letting
 * the browser jump, so tapping a citation on a phone lands on the card instead of jerking the page.
 */
export function CitationChip({
  number,
  anchor,
  href,
  title,
  host,
  snippet,
  children,
}: CitationChipProps & { node?: unknown; children?: ReactNode }) {
  const scrollToSource = (event: MouseEvent<HTMLAnchorElement>) => {
    // Modifier keys keep the browser's own behaviour (open in a new tab).
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    const behavior = prefersReducedMotion() ? "auto" : "smooth";
    // The Sources panel may be folded: ask it to open, then scroll once the card is on screen.
    window.dispatchEvent(new CustomEvent(CITE_EVENT, { detail: anchor }));
    let tries = 0;
    const land = () => {
      const card = document.getElementById(anchor);
      if (card) card.scrollIntoView({ behavior, block: "start" });
      else if (++tries < 12) requestAnimationFrame(land);
    };
    land();
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          onClick={scrollToSource}
          aria-label={`Source ${number}: ${title}`}
          className="cite"
        >
          {children ?? number}
        </a>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 text-left">
        <p className="font-medium">{title}</p>
        {host ? <p className="opacity-70">{host}</p> : null}
        {snippet ? <p className="mt-1 line-clamp-3 opacity-70">{snippet}</p> : null}
      </TooltipContent>
    </Tooltip>
  );
}
