import * as React from "react";
import { rovingIndex, radioKeyDown } from "@/components/fold/radioKeys";
import { TYPE_FILTERS, type FileFilterId } from "./fileModel";

/**
 * Type chips, one radio group like Drive's. The chosen chip carries the tab stop; arrows, Home
 * and End move the filter (the same pattern the Studio tiles use).
 */
export function FileTypeChips({
  value,
  onChange,
  counts,
}: {
  value: FileFilterId;
  onChange: (id: FileFilterId) => void;
  /** Files per chip, shown as a quiet count. Optional. */
  counts?: Partial<Record<FileFilterId, number>>;
}) {
  const ids = TYPE_FILTERS.map((f) => f.id);

  return (
    <div className="hscroll filters" role="radiogroup" aria-label="Filter by file type">
      {TYPE_FILTERS.map((chip) => (
        <button
          key={chip.id}
          type="button"
          role="radio"
          aria-checked={value === chip.id}
          data-filter={chip.id}
          data-id={chip.id}
          tabIndex={rovingIndex(ids, value, chip.id)}
          onKeyDown={radioKeyDown(ids, value, (id) => onChange(id as FileFilterId))}
          className="pill chip"
        >
          {chip.label}
          {counts && typeof counts[chip.id] === "number" && (
            <span className="chip-n mono tnum" aria-hidden="true">
              {counts[chip.id]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
