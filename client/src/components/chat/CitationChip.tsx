import type { MouseEvent, ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CitationChipProps } from "@/lib/citations";

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
    document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          onClick={scrollToSource}
          aria-label={`Source ${number}: ${title}`}
          className="mx-px inline-flex items-center rounded-sm bg-muted px-[0.28em] align-super text-[0.7em] font-medium text-muted-foreground underline-offset-2 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
