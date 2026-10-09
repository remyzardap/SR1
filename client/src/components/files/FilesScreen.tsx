import * as React from "react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { FocusBrackets } from "@/components/art/FocusBrackets";
import { DitherSphere } from "@/components/art/DitherSphere";
import { LinearDitherBar } from "@/components/art/LinearDitherBar";
import { FoldGroup, FoldSection, useFoldState } from "@/components/fold";
import { FileRow } from "./FileRow";
import { FileSortButton } from "./FileSortButton";
import { FileGlyph } from "./FileTypeIcon";
import { FileTypeChips } from "./FileTypeChips";
import type { FileActions } from "./FileRowMenu";
import {
  CATEGORY_LABELS,
  SORT_KEYS,
  TYPE_FILTERS,
  categoryOf,
  filterFiles,
  formatBytes,
  formatStorage,
  sortFiles,
  storageBreakdown,
  usedBytes as sumBytes,
  type FileCategory,
  type FileFilterId,
  type FileItem,
  type FileSort,
} from "./fileModel";

const EMPTY_COPY: Record<FileCategory | "all", string> = {
  all: "Documents, images and videos that Sutaeru makes will land here.",
  documents: "Reports, notes and documents Sutaeru makes will land here.",
  images: "Pictures Sutaeru makes will land here.",
  sheets: "Spreadsheets Sutaeru makes will land here.",
  slides: "Decks Sutaeru makes will land here.",
  pdfs: "PDFs you upload or export will land here.",
  other: "Videos, audio and everything else will land here.",
};

const FOLD_IDS = ["storage"];

export interface FilesScreenProps extends FileActions {
  files: FileItem[];
  query: string;
  onQueryChange: (q: string) => void;
  filter: FileFilterId;
  onFilterChange: (id: FileFilterId) => void;
  sort: FileSort;
  onSortChange: (sort: FileSort) => void;
  view?: "active" | "trashed";
  onViewChange?: (view: "active" | "trashed") => void;
  storageCapBytes?: number;
  /** Overrides the total the files add up to (the server knows what the list cannot). */
  storageUsedBytes?: number;
  isUploading?: boolean;
  uploadingFileName?: string;
  uploadProgress?: number;
  onUpload?: () => void;
  onOpenFile?: (file: FileItem) => void;
  onAskSutaeru?: () => void;
  /** Frozen clock for the date column, so the lab and the tests are reproducible. */
  now?: Date;
  className?: string;
}

/** The 24-step ink meter, folded inside the Storage line. */
function StorageMeter({ used, cap }: { used: number; cap: number }) {
  const filled = Math.min(24, Math.max(0, Math.round((used / (cap || 1)) * 24)));
  return (
    <div className="segs" aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => (
        <i key={i} className={i < filled ? "on" : undefined} />
      ))}
    </div>
  );
}

function DotMeter({ used, cap }: { used: number; cap: number }) {
  const filled = Math.min(5, Math.max(used > 0 ? 1 : 0, Math.round((used / (cap || 1)) * 5)));
  return (
    <span className="dots" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <i key={i} className={i < filled ? "on" : undefined} />
      ))}
    </span>
  );
}

/**
 * Files as a list, the way Drive does it: one row per file — its type, its whole name, and
 * "type · size · date" underneath — with type chips on top, one sort control, and storage folded
 * into a single line at the bottom. Presentational: every action comes in as a prop.
 */
export function FilesScreen({
  files,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  view = "active",
  onViewChange,
  storageCapBytes = 10 * 1024 * 1024 * 1024,
  storageUsedBytes,
  isUploading = false,
  uploadingFileName,
  uploadProgress = 0.65,
  onUpload,
  onOpenFile,
  onAskSutaeru,
  now,
  className,
  ...actions
}: FilesScreenProps) {
  const folds = useFoldState("files", FOLD_IDS);

  const inView = useMemo(() => files.filter((f) => (view === "active" ? !f.trashed : f.trashed)), [files, view]);
  const active = useMemo(() => files.filter((f) => !f.trashed), [files]);
  const visible = useMemo(() => sortFiles(filterFiles(inView, filter, query), sort), [inView, filter, query, sort]);

  const counts = useMemo(() => {
    const tally = { all: inView.length } as Record<FileFilterId, number>;
    for (const chip of TYPE_FILTERS) if (chip.id !== "all") tally[chip.id] = 0;
    for (const file of inView) tally[categoryOf(file)] += 1;
    return tally;
  }, [inView]);

  const used = storageUsedBytes ?? sumBytes(active);
  const slices = useMemo(() => storageBreakdown(active), [active]);
  const chipLabel = TYPE_FILTERS.find((c) => c.id === filter)?.label ?? "All";
  const searching = query.trim().length > 0;
  const countLabel =
    visible.length === inView.length
      ? `${visible.length} ${visible.length === 1 ? "item" : "items"}`
      : `${visible.length} of ${inView.length}`;

  return (
    <section className={cn("view view-enter", className)} id="view-files">
      <div className="files-head">
        <div className="head-row">
          <h1 className="title">Files.</h1>
          <span className="mono ink tnum files-count">{countLabel}</span>
        </div>
      </div>

      <div className="search">
        <label className="sr" htmlFor="fq">
          Search files
        </label>
        <SutaeruIcon name="search" className="ico" />
        <input
          id="fq"
          type="search"
          placeholder="Search in Files"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        {onUpload && (
          <button type="button" className="icon-btn flat search-upload" onClick={onUpload} aria-label="Upload files" title="Upload">
            <SutaeruIcon name="up" className="ico" />
          </button>
        )}
      </div>

      <FileTypeChips value={filter} onChange={onFilterChange} counts={counts} />

      <div className="fl-head">
        {onViewChange ? (
          <div className="fl-views" role="group" aria-label="Show files">
            <button type="button" className="pill sm" aria-pressed={view === "active"} onClick={() => onViewChange("active")}>
              Active
            </button>
            <button type="button" className="pill sm" aria-pressed={view === "trashed"} onClick={() => onViewChange("trashed")}>
              Trash
            </button>
          </div>
        ) : (
          <span className="mono">{SORT_KEYS.find((k) => k.id === sort.key)?.label ?? "Name"}</span>
        )}
        <FileSortButton sort={sort} onChange={onSortChange} />
      </div>

      <ul className="fl" id="fileList">
        {isUploading && (
          <li className="frow-wrap is-uploading" role="status" aria-label={`Uploading ${uploadingFileName || "file"}`}>
            <span className="frow">
              <span className="ftype accent">
                <FileGlyph name="file" />
              </span>
              <span className="ft">
                <b>{uploadingFileName || "site-survey-2026.docx"}</b>
                <small>
                  <span className="live-dot" aria-hidden="true" /> Uploading · {Math.round(uploadProgress * 100)}% complete
                </small>
                <span className="bar-holder">
                  <LinearDitherBar progress={uploadProgress} width={200} height={14} asCanvas />
                </span>
              </span>
            </span>
          </li>
        )}

        {visible.map((file) => (
          <FileRow key={file.id} file={file} view={view} actions={actions} onOpen={onOpenFile} now={now} />
        ))}

        {!visible.length && !isUploading && (
          <li className="fl-empty">
            <div className="panel empty">
              <FocusBrackets className="show" />
              <DitherSphere width={150} height={150} />
              <b>{searching ? "No files match." : view === "trashed" ? "Trash is empty." : "Nothing here yet."}</b>
              <p>
                {searching
                  ? `Nothing called “${query.trim()}” in ${chipLabel}. Try fewer words or another filter.`
                  : view === "trashed"
                    ? "Files you move to trash rest here until you delete them for good."
                    : EMPTY_COPY[filter]}
              </p>
              {searching ? (
                <button type="button" className="btn" onClick={() => onQueryChange("")}>
                  Clear search
                </button>
              ) : (
                onAskSutaeru && (
                  <button type="button" className="btn ink big" onClick={onAskSutaeru}>
                    Ask Sutaeru to make one
                  </button>
                )
              )}
            </div>
          </li>
        )}
      </ul>

      <FoldGroup state={folds} className="files-folds">
        <FoldSection
          id="storage"
          label="Storage"
          pick={formatStorage(used, storageCapBytes)}
          mini={<DotMeter used={used} cap={storageCapBytes} />}
        >
          <div className="storage-body" role="meter" aria-valuenow={Math.round(used)} aria-valuemin={0} aria-valuemax={Math.round(storageCapBytes)} aria-label="Storage used">
            <StorageMeter used={used} cap={storageCapBytes} />
            <p className="storage-line">
              <b className="tnum">{formatStorage(used, storageCapBytes)}</b>
              <span className="quiet"> used across {active.length} {active.length === 1 ? "file" : "files"}</span>
            </p>
            {slices.length > 0 ? (
              <ul className="storage-splits">
                {slices.map((slice) => (
                  <li key={slice.id}>
                    <span className="ss-label">{CATEGORY_LABELS[slice.id]}</span>
                    <span className="ss-count mono tnum">{slice.count}</span>
                    <span className="ss-size mono ink tnum">{formatBytes(slice.bytes)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="storage-line quiet">Nothing stored yet.</p>
            )}
          </div>
        </FoldSection>
      </FoldGroup>
    </section>
  );
}

export default FilesScreen;
