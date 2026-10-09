import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SORT_KEYS, sortDirLabel, sortLabel, type FileSort, type FileSortKey } from "./fileModel";

const SortIcon = () => (
  <svg className="fi" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 5v14M4 15l4 4 4-4M16 19V5M12 9l4-4 4 4" />
  </svg>
);

/**
 * One button that says how the list is ordered ("Newest", "Largest"), opening a short menu:
 * the key as a radio group, the direction as a single flip.
 */
export function FileSortButton({ sort, onChange }: { sort: FileSort; onChange: (sort: FileSort) => void }) {
  const flip = () => onChange({ ...sort, dir: sort.dir === "asc" ? "desc" : "asc" });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="fold-all sort-btn" aria-label={`Sort: ${sortLabel(sort)}, ${sortDirLabel(sort)}`}>
          <SortIcon />
          {sortLabel(sort)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="sort-menu">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={sort.key} onValueChange={(value) => onChange({ ...sort, key: value as FileSortKey })}>
          {SORT_KEYS.map((key) => (
            <DropdownMenuRadioItem key={key.id} value={key.id}>
              {key.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={flip} className="sort-dir">
          <svg className="fi" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d={sort.dir === "asc" ? "M12 5v14M6 13l6 6 6-6" : "M12 19V5M6 11l6-6 6 6"} />
          </svg>
          {sortDirLabel(sort)}
          <span className="mono sort-rev">Reverse</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
