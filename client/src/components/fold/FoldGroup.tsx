import * as React from "react";
import { createContext, useContext, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { FoldState } from "./useFoldState";

const FoldContext = createContext<FoldState | null>(null);

export const useFoldGroup = () => useContext(FoldContext);

/**
 * The accordion controller: every FoldSection inside reads its open state from `state`
 * (from `useFoldState`). The same state feeds the page head's FoldAllButton.
 */
export function FoldGroup({ state, className, children }: { state: FoldState; className?: string; children: ReactNode }) {
  return (
    <FoldContext.Provider value={state}>
      <div className={cn("folds", className)} data-layout={state.layout}>
        {children}
      </div>
    </FoldContext.Provider>
  );
}

/** "Fold all / Open all" mono pill for the page head. Shown only for three or more sections. */
export function FoldAllButton({ state, className }: { state: FoldState; className?: string }) {
  if (state.ids.length < 3) return null;
  const folded = state.allFolded;
  return (
    <button type="button" className={cn("fold-all", className)} onClick={folded ? state.openAll : state.foldAll}>
      <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {folded ? <path d="M7 10l5-5 5 5M7 14l5 5 5-5" /> : <path d="M7 5l5 5 5-5M7 19l5-5 5 5" />}
      </svg>
      {folded ? "Open all" : "Fold all"}
    </button>
  );
}
