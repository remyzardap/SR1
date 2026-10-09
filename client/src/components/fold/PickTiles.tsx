import * as React from "react";
import type { ReactNode } from "react";

import { SutaeruIcon } from "@/components/SutaeruIcon";
import { FocusBrackets } from "@/components/art/FocusBrackets";
import { cn } from "@/lib/utils";
import { Pic, type Art } from "./Pic";
import { radioKeyDown, rovingIndex } from "./radioKeys";

export interface PickItem {
  id: string;
  label: string;
  /** Optional one-line sub under the caption. */
  sub?: ReactNode;
  /** Image url or a drawn node, filling the 116x86 tile. */
  art: Art;
}

export interface PickTilesProps {
  items: PickItem[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name of the radiogroup. */
  label: string;
  /** "shape": art centred on the panel and the sub set in mono (the Studio's Shape row). */
  variant?: "photo" | "shape";
  className?: string;
}

export const Tick = ({ className }: { className?: string }) => (
  <span className={cn("tick", className)} aria-hidden="true">
    <SutaeruIcon name="check" signal={false} className="ico" />
  </span>
);

/** Tile width in px: 116 on phones, 128 from 760 px. Drawn art can size itself with it. */
export const tileWidth = () => (typeof window !== "undefined" && window.innerWidth >= 760 ? 128 : 116);
export const tileHeight = (w: number) => (w >= 128 ? 96 : 86);

/**
 * The Studio tile row: picture tiles with a caption and an optional one-line sub.
 * Selected = ink outline, tick and focus brackets. Scrolls sideways on phones, wraps on desktop.
 */
export function PickTiles({ items, value, onChange, label, variant = "photo", className }: PickTilesProps) {
  const ids = items.map((i) => i.id);
  return (
    <div className={cn("opts", className)} role="radiogroup" aria-label={label} onKeyDown={radioKeyDown(ids, value, onChange)}>
      {items.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={rovingIndex(ids, value, o.id)}
            data-id={o.id}
            className={cn("opt", variant === "shape" && "shape")}
            onClick={() => onChange(o.id)}
          >
            <span className="otw">
              <span className="ot">
                <Pic art={o.art} />
                <Tick />
              </span>
              {on && <FocusBrackets />}
            </span>
            <span className="cap">
              <b>{o.label}</b>
              {o.sub ? <small className={variant === "shape" ? "mono" : undefined}>{o.sub}</small> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
