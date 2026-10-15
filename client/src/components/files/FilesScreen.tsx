import * as React from "react";
import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { FoldGroup, FoldSection, useFoldState } from "@/components/fold";
import { FileRowMenu, type FileActions } from "./FileRowMenu";
import {
  CATEGORY_LABELS,
  SORT_KEYS,
  categoryOf,
  dateLabel,
  extension,
  filterFiles,
  formatBadge,
  formatBytes,
  formatStorage,
  metaLine,
  sortFiles,
  storageBreakdown,
  typeLabel,
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
  storageUsedBytes?: number;
  isUploading?: boolean;
  uploadingFileName?: string;
  uploadProgress?: number;
  onUpload?: () => void;
  onOpenFile?: (file: FileItem) => void;
  onAskSutaeru?: () => void;
  onBack?: () => void;
  now?: Date;
  className?: string;
}

// 5x7 Dot matrix font bitmaps for digits 0-9 matching design/sutaeru-quiet/Files.dc.html
const DIGIT_BITMAPS: Record<string, number[]> = {
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  "3": [0b11111, 0b00001, 0b00010, 0b00110, 0b00001, 0b10001, 0b01110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
};

export function DotMatrixNumber({ value, className }: { value: number; className?: string }) {
  const digits = Math.max(0, Math.floor(value)).toString();
  const circles: { cx: number; cy: number; key: string }[] = [];
  const STEP = 5.2;
  const RADIUS = 1.98;
  const COLS_PER_DIGIT = 6;

  for (let d = 0; d < digits.length; d++) {
    const char = digits[d];
    const bitmap = DIGIT_BITMAPS[char] || DIGIT_BITMAPS["0"];
    const digitColOffset = d * COLS_PER_DIGIT;
    for (let row = 0; row < 7; row++) {
      const cy = Number((2.6 + row * STEP).toFixed(1));
      const mask = bitmap[row];
      for (let col = 0; col < 5; col++) {
        if ((mask & (1 << (4 - col))) !== 0) {
          const cx = Number((2.6 + (digitColOffset + col) * STEP).toFixed(1));
          circles.push({ cx, cy, key: `${d}-${row}-${col}` });
        }
      }
    }
  }

  const width = Math.max(26, (digits.length * COLS_PER_DIGIT - 1) * STEP);
  const height = 36.4;

  return (
    <svg
      role="img"
      aria-label={String(value)}
      width={Math.round(width)}
      height={36}
      viewBox={`0 0 ${width.toFixed(1)} ${height.toFixed(1)}`}
      fill="currentColor"
      style={{ display: "block", overflow: "visible" }}
      className={className}
    >
      {circles.map((c) => (
        <circle key={c.key} cx={c.cx} cy={c.cy} r={RADIUS} />
      ))}
    </svg>
  );
}

/** Deterministic mapping of files to studio photos in client/public/studio/m/ */
export function photoForFile(file: FileItem): string {
  if (file.photoUrl) return file.photoUrl;
  if (file.kind === "image" && file.fileUrl) return file.fileUrl;
  const k = (file.kind || "").toLowerCase();
  const fmt = (file.format || "").toLowerCase();

  if (fmt === "xlsx" || fmt === "csv" || k === "sheet") return "/studio/m/angle-top.webp";
  if (k === "report") return "/studio/m/look-clay.webp";
  if (k === "brief") return "/studio/m/var-window-2.webp";
  if (k === "chat") return "/studio/m/light-studio.webp";
  if (fmt === "pdf" || k === "pdf") return "/studio/m/light-window.webp";
  if (k === "deck" || fmt === "pptx") return "/studio/m/angle-high.webp";
  if (k === "video" || fmt === "mp4") return "/studio/m/light-night.webp";
  if (k === "audio" || fmt === "m4a") return "/studio/m/var-night-2.webp";
  if (k === "image") return "/studio/m/light-golden.webp";
  return "/studio/m/look-painted.webp";
}

/** The badge tag at bottom left of card, matching Quiet board labels */
export function cardLabel(file: FileItem): string {
  const k = (file.kind || "").toLowerCase();
  const fmt = (file.format || "").toLowerCase();
  if (k === "report") return "Report";
  if (k === "sheet" || fmt === "xlsx" || fmt === "csv") return "Sheet";
  if (k === "brief") return "Brief";
  if (k === "deck" || fmt === "pptx") return "Deck";
  if (k === "video" || fmt === "mp4") return "Video";
  if (k === "chat") return "Chat";
  if (k === "image") return "Image";
  if (k === "document") return "Doc";
  if (fmt === "pdf") return "PDF";
  return typeLabel(file);
}

/** Height of card in 2-column masonry grid */
export function cardHeight(file: FileItem, colIndex: number, rowIndex: number): number {
  if (colIndex === 0) {
    return rowIndex % 2 === 0 ? 160 : 130;
  }
  const cycle = [112, 112, 130];
  return cycle[rowIndex % cycle.length];
}

/** Storage meter segment bar */
function StorageMeter({ used, cap }: { used: number; cap: number }) {
  const raw = Math.round((used / (cap || 1)) * 24);
  const filled = Math.min(24, used > 0 ? Math.max(1, raw) : 0);
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
  onBack,
  now = new Date(),
  className,
  ...actions
}: FilesScreenProps) {
  const folds = useFoldState("files", FOLD_IDS);
  const searchInputId = useId();
  const [searchOpen, setSearchOpen] = useState(query.trim().length > 0);

  const inView = useMemo(
    () => files.filter((f) => (view === "active" ? !f.trashed : Boolean(f.trashed))),
    [files, view]
  );
  const active = useMemo(() => files.filter((f) => !f.trashed), [files]);

  // Support video filter specifically, otherwise default filterFiles
  const visible = useMemo(() => {
    let list = inView;
    if (filter === ("video" as any)) {
      list = inView.filter((f) => {
        const fmt = extension(f);
        const k = (f.kind || "").toLowerCase();
        return fmt === "mp4" || k === "video";
      });
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        list = list.filter((f) => f.name.toLowerCase().includes(q));
      }
    } else {
      list = filterFiles(inView, filter, query);
    }
    return sortFiles(list, sort);
  }, [inView, filter, query, sort]);

  const counts = useMemo(() => {
    const tally: Record<string, number> = {
      all: inView.length,
      documents: 0,
      images: 0,
      sheets: 0,
      slides: 0,
      pdfs: 0,
      video: 0,
      other: 0,
    };
    for (const f of inView) {
      const cat = categoryOf(f);
      tally[cat] = (tally[cat] || 0) + 1;
      const fmt = extension(f);
      const k = (f.kind || "").toLowerCase();
      if (fmt === "mp4" || k === "video") {
        tally.video = (tally.video || 0) + 1;
      }
    }
    return tally;
  }, [inView]);

  const used = storageUsedBytes ?? sumBytes(active);
  const slices = useMemo(() => storageBreakdown(active), [active]);
  const searching = query.trim().length > 0;

  // Filter chips matching Quiet board: All, Docs, Images, Video, Sheets (and Slides, Other)
  const filterTabs: Array<{ id: FileFilterId; label: string; count: number }> = [
    { id: "all", label: "All", count: counts.all },
    { id: "documents", label: "Docs", count: counts.documents },
    { id: "images", label: "Images", count: counts.images },
    { id: "video" as any, label: "Video", count: counts.video },
    { id: "sheets", label: "Sheets", count: counts.sheets },
    { id: "slides", label: "Slides", count: counts.slides },
    { id: "other", label: "Other", count: counts.other },
  ];

  // Distribute items into 2 columns for staggered masonry layout
  const col0: FileItem[] = [];
  const col1: FileItem[] = [];
  visible.forEach((f, idx) => {
    if (idx % 2 === 0) col0.push(f);
    else col1.push(f);
  });

  const chipLabel =
    filterTabs.find((c) => c.id === filter)?.label ?? (filter === "all" ? "All" : filter);

  return (
    <div className={cn("files-screen-wrap", className)} id="view-files">
      {/* Quiet Header */}
      <header className="files-header">
        <button
          type="button"
          className="qtap"
          aria-label="Back"
          onClick={onBack || (() => window.history.back())}
          style={{
            flex: "none",
            display: "grid",
            placeItems: "center",
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: 0,
            background: "none",
            color: "var(--ink)",
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <span style={{ flex: 1 }} />
        {onViewChange && (
          <button
            type="button"
            className={cn("files-pill", view === "trashed" && "active")}
            style={{ height: 32, padding: "0 12px", fontSize: 12, marginRight: 4 }}
            aria-pressed={view === "trashed"}
            onClick={() => onViewChange(view === "active" ? "trashed" : "active")}
          >
            {view === "active" ? "Trash" : "Active"}
          </button>
        )}
        <button
          type="button"
          className="qtap"
          aria-label="Search"
          aria-expanded={searchOpen}
          onClick={() => {
            setSearchOpen((prev) => !prev);
          }}
          style={{
            flex: "none",
            display: "grid",
            placeItems: "center",
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: 0,
            background: "none",
            color: "var(--ink)",
          }}
        >
          <svg
            width="21"
            height="21"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4.2-4.2" />
          </svg>
        </button>
      </header>

      {/* Expandable Search Bar */}
      {(searchOpen || searching) && (
        <div className="files-search-bar qbar">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "var(--quiet)", flex: "none" }}
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4.2-4.2" />
          </svg>
          <input
            id={searchInputId}
            type="search"
            placeholder="Search in Files"
            aria-label="Search files"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            autoFocus
          />
          {searching && (
            <button
              type="button"
              className="qtap"
              aria-label="Clear search"
              onClick={() => onQueryChange("")}
              style={{
                border: 0,
                background: "none",
                color: "var(--quiet)",
                padding: 4,
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Title block with 5x7 Dot Matrix Item Count */}
      <div className="files-title-row">
        <h1 className="files-title">
          <span style={{ display: "block", color: "var(--ink)" }}>Files</span>
          <span style={{ display: "block", color: "var(--quiet)" }}>
            {view === "trashed" ? "Trash" : "Everything"}
          </span>
        </h1>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7, color: "var(--ink)" }}>
          <DotMatrixNumber value={visible.length} />
          <span className="qmono" style={{ fontSize: "8.5px", color: "var(--quiet)" }}>
            {visible.length === 1 ? "Item" : "Items"}
          </span>
        </div>
      </div>

      {/* Filter Row: scrollable pills */}
      <div className="files-pills-row" role="radiogroup" aria-label="Filter files by kind">
        {filterTabs.map((tab) => {
          const isSelected = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={cn("files-pill", isSelected && "active")}
              onClick={() => onFilterChange(tab.id)}
              data-filter={tab.id}
            >
              {tab.label}
              <span className="pill-count">{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/* Main Masonry Grid */}
      <main className="files-main">
        {/* Active Upload Card */}
        {isUploading && (
          <div
            className="qcard qcard-uploading"
            role="status"
            aria-label={`Uploading ${uploadingFileName || "file"}`}
            style={{ marginBottom: 12 }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="qmono" style={{ color: "var(--accent)", fontSize: 11 }}>
                Uploading
              </span>
              <span className="qmono" style={{ fontSize: 11, color: "var(--ink)" }}>
                {Math.round(uploadProgress * 100)}% complete
              </span>
            </div>
            <b
              style={{
                fontFamily: "var(--body)",
                fontSize: 14,
                color: "var(--ink)",
                marginTop: 6,
                overflowWrap: "anywhere",
              }}
            >
              {uploadingFileName || "site-survey-2026.docx"}
            </b>
            <div
              className="bar-holder"
              role="progressbar"
              aria-valuenow={Math.round(uploadProgress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Upload progress"
            >
              <div
                className="bar-fill qsheen"
                style={{ width: `${Math.round(uploadProgress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* 2-column staggered masonry layout */}
        {visible.length > 0 ? (
          <div className="files-masonry">
            {/* Column 0 */}
            <div className="files-col">
              {col0.map((file, rIdx) => {
                const height = cardHeight(file, 0, rIdx);
                const photo = photoForFile(file);
                const badge = formatBadge(file);
                const label = cardLabel(file);
                return (
                  <div
                    key={file.id}
                    className="qcard"
                    style={{ height: `${height}px` }}
                  >
                    <button
                      type="button"
                      className="qtap qcard-btn"
                      aria-label={`Open ${file.name}, ${metaLine(file, now)}`}
                      title={`${file.name} · ${metaLine(file, now)}`}
                      onClick={() => onOpenFile?.(file)}
                    >
                      <img
                        src={photo}
                        alt=""
                        width="173"
                        height={height}
                        style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
                        loading="lazy"
                      />
                      <span className="sr-only">
                        {file.name} · {metaLine(file, now)}
                      </span>
                      {badge && <span className="qidx">{badge}</span>}
                      {file.live && <span className="qlive" aria-label="Writing in progress" />}
                      <span className="qmono qcard-tag">{label}</span>
                      {file.live && (
                        <span
                          className="bar-holder"
                          style={{
                            position: "absolute",
                            bottom: 8,
                            right: 10,
                            left: 70,
                            height: 4,
                            background: "rgba(255,255,255,.3)",
                            borderRadius: 2,
                            overflow: "hidden",
                          }}
                        >
                          <span
                            className="bar-fill"
                            style={{ display: "block", height: "100%", width: "50%", background: "#F4511E" }}
                          />
                        </span>
                      )}
                    </button>
                    <FileRowMenu file={file} view={view} actions={actions} />
                  </div>
                );
              })}
            </div>

            {/* Column 1 (offset with margin-top: 28px) */}
            <div className="files-col col-offset">
              {col1.map((file, rIdx) => {
                const height = cardHeight(file, 1, rIdx);
                const photo = photoForFile(file);
                const badge = formatBadge(file);
                const label = cardLabel(file);
                return (
                  <div
                    key={file.id}
                    className="qcard"
                    style={{ height: `${height}px` }}
                  >
                    <button
                      type="button"
                      className="qtap qcard-btn"
                      aria-label={`Open ${file.name}, ${metaLine(file, now)}`}
                      title={`${file.name} · ${metaLine(file, now)}`}
                      onClick={() => onOpenFile?.(file)}
                    >
                      <img
                        src={photo}
                        alt=""
                        width="173"
                        height={height}
                        style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
                        loading="lazy"
                      />
                      <span className="sr-only">
                        {file.name} · {metaLine(file, now)}
                      </span>
                      {badge && <span className="qidx">{badge}</span>}
                      {file.live && <span className="qlive" aria-label="Writing in progress" />}
                      <span className="qmono qcard-tag">{label}</span>
                      {file.live && (
                        <span
                          className="bar-holder"
                          style={{
                            position: "absolute",
                            bottom: 8,
                            right: 10,
                            left: 70,
                            height: 4,
                            background: "rgba(255,255,255,.3)",
                            borderRadius: 2,
                            overflow: "hidden",
                          }}
                        >
                          <span
                            className="bar-fill"
                            style={{ display: "block", height: "100%", width: "50%", background: "#F4511E" }}
                          />
                        </span>
                      )}
                    </button>
                    <FileRowMenu file={file} view={view} actions={actions} />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          !isUploading && (
            <div className="files-empty-card">
              <b>
                {searching
                  ? "No files match."
                  : view === "trashed"
                  ? "Trash is empty."
                  : "Nothing here yet."}
              </b>
              <p>
                {searching
                  ? `Nothing called “${query.trim()}” in ${chipLabel}. Try fewer words or another filter.`
                  : view === "trashed"
                  ? "Files you move to trash rest here until you delete them for good."
                  : EMPTY_COPY[filter as FileCategory] || EMPTY_COPY.all}
              </p>
              {searching ? (
                <button
                  type="button"
                  className="files-empty-btn qtap"
                  onClick={() => onQueryChange("")}
                >
                  Clear search
                </button>
              ) : (
                onAskSutaeru && (
                  <button
                    type="button"
                    className="files-empty-btn qtap"
                    onClick={onAskSutaeru}
                  >
                    Ask Sutaeru to make one
                  </button>
                )
              )}
            </div>
          )
        )}

        {/* Folded Storage Section at the bottom */}
        <FoldGroup state={folds} className="files-folds">
          <FoldSection
            id="storage"
            label="Storage"
            pick={formatStorage(used, storageCapBytes)}
            mini={<DotMeter used={used} cap={storageCapBytes} />}
          >
            <div
              className="storage-body"
              role="meter"
              aria-valuenow={Math.round(used)}
              aria-valuemin={0}
              aria-valuemax={Math.round(storageCapBytes)}
              aria-label="Storage used"
            >
              <StorageMeter used={used} cap={storageCapBytes} />
              <p className="storage-line">
                <b className="tnum">{formatStorage(used, storageCapBytes)}</b>
                <span className="quiet">
                  {" "}
                  used across {active.length} {active.length === 1 ? "file" : "files"}
                </span>
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

        {/* Bottom fade overlay */}
        <div aria-hidden="true" className="files-fade" />
      </main>

      {/* Bottom FAB Upload Button */}
      <div className="files-fab-wrap">
        <button
          type="button"
          className="qtap files-fab"
          aria-label="Add a file"
          onClick={onUpload}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default FilesScreen;
