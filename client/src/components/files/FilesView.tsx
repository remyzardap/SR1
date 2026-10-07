import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { FocusBrackets } from "@/components/art/FocusBrackets";
import { DitherSphere } from "@/components/art/DitherSphere";
import { DocMini } from "@/components/art/DocMini";
import { LinearDitherBar } from "@/components/art/LinearDitherBar";
import { useReducedMotion } from "@/components/art/useMotion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RotateCcw } from "lucide-react";

export interface FileItem {
  id: string | number;
  name: string;
  kind: string; // "report" | "deck" | "sheet" | "image" | "video" | "audio" | "brief" | "monitor" | "other" | "document"
  format?: string;
  meta: string;
  fileUrl?: string;
  photoUrl?: string;
  doc?: any;
  live?: boolean;
  fresh?: boolean;
  fileSizeBytes?: number | null;
  createdAt?: Date | string;
  updatedAt?: Date | string | null;
  trashed?: boolean;
  threadId?: string | null;
  sourcesCount?: number;
  styleLabel?: string | null;
}

export interface FilesViewProps {
  files: FileItem[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeFilter: string; // "all" | "report" | "deck" | "sheet" | "image" | "video"
  onFilterChange: (filter: string) => void;
  storageUsedBytes: number;
  storageCapBytes?: number; // default 10 GB
  isUploading?: boolean;
  uploadingFileName?: string;
  uploadProgress?: number;
  view?: "active" | "trashed";
  onViewChange?: (view: "active" | "trashed") => void;
  onUpload?: () => void;
  onPreviewFile?: (file: FileItem) => void;
  onOpenFileInChat?: (file: FileItem) => void;
  onDownloadFile?: (file: FileItem) => void;
  onRenameFile?: (file: FileItem) => void;
  onMoveFile?: (file: FileItem) => void;
  onTrashFile?: (file: FileItem) => void;
  onRestoreFile?: (file: FileItem) => void;
  onDeleteFile?: (file: FileItem) => void;
  onOpenAsBrief?: (file: FileItem) => void;
  onAskSutaeru?: () => void;
  className?: string;
}

export const FILTERS = [
  ["all", "All"],
  ["report", "Reports"],
  ["deck", "Decks"],
  ["sheet", "Sheets"],
  ["image", "Images"],
  ["video", "Videos"],
] as const;

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function formatStorage(usedBytes: number, capBytes: number): string {
  const usedGb = (usedBytes / (1024 * 1024 * 1024)).toFixed(1);
  const capGb = Math.round(capBytes / (1024 * 1024 * 1024));
  return `${usedGb} of ${capGb} GB`;
}

export function drawLiveBar(
  canvas: HTMLCanvasElement,
  progress: number,
  options: { t?: number; color?: string; track?: string } = {}
): void {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round((rect.width || canvas.width || 200) * dpr));
  const h = Math.max(1, Math.round((rect.height || canvas.height || 14) * dpr));

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const widthCss = w / dpr;
  const heightCss = h / dpr;
  ctx.clearRect(0, 0, widthCss, heightCss);

  const styleInk =
    typeof document !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue("--ink").trim()
      : "#242320";
  const styleRule =
    typeof document !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue("--rule").trim()
      : "#CFCBC3";

  const ink = options.color || styleInk || "#242320";
  const dot = options.track || styleRule || "#CFCBC3";
  const cy = heightCss / 2;
  const th = Math.min(6, heightCss * 0.6);
  const r = th / 2;
  const frame = Math.floor((options.t || 0) / 110);

  ctx.fillStyle = dot;
  for (let px = 2; px < widthCss - 1; px += 6) {
    ctx.beginPath();
    ctx.arc(px, cy, 0.95, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = ink;
  const a = progress * widthCss;
  if (a > 0.5) {
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(0, cy - r, a, th, r);
      ctx.fill();
    } else {
      ctx.fillRect(0, cy - r, a, th);
    }
  }

  if (progress > 0 && progress < 1) {
    let seed = (frame * 31 + 7) >>> 0;
    const R = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const len = 24;
    for (let i = 0; i < len; i += 1.5) {
      for (let j = -r - 1.5; j <= r + 1.5; j += 1.5) {
        const k = 1 - i / len;
        if (R() < k * k * 0.9) {
          ctx.fillRect(a + i, cy + j, 1.2, 1.2);
        }
      }
    }
  }
}

function LiveFileBar() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [etaText, setEtaText] = useState("About 40 sec left");
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (reducedMotion) {
      drawLiveBar(canvas, 0.75, { t: 0 });
      return;
    }

    let animId = 0;
    const t0 = performance.now();

    const loop = (now: number) => {
      const p = 0.55 + 0.4 * (((now - t0) / 40000) % 1);
      drawLiveBar(canvas, p, { t: now });
      const secLeft = Math.round((1 - p) * 90);
      setEtaText(secLeft > 60 ? `${Math.round(secLeft / 60)} min left` : `${secLeft} sec left`);
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [reducedMotion]);

  return (
    <>
      <span className="bar-holder">
        <canvas ref={canvasRef} className="bar" width={200} height={14} aria-hidden="true" />
      </span>
      <span className="mono tnum" id="liveEta">
        {etaText}
      </span>
    </>
  );
}

function matchesFilter(f: FileItem, filter: string): boolean {
  if (filter === "all") return true;
  const k = f.kind.toLowerCase();
  const fmt = (f.format || "").toLowerCase();
  if (filter === "report") return k === "report" || fmt === "pdf" || fmt === "docx" || fmt === "md";
  if (filter === "deck") return k === "deck" || fmt === "pptx";
  if (filter === "sheet") return k === "sheet" || fmt === "xlsx" || fmt === "csv";
  if (filter === "image")
    return k === "image" || fmt === "png" || fmt === "jpg" || fmt === "jpeg" || fmt === "webp";
  if (filter === "video") return k === "video" || fmt === "mp4";
  return k === filter;
}

function matchesSearch(f: FileItem, q: string): boolean {
  if (!q.trim()) return true;
  const lower = q.toLowerCase();
  return (
    f.name.toLowerCase().includes(lower) ||
    f.meta.toLowerCase().includes(lower) ||
    Boolean(f.kind && f.kind.toLowerCase().includes(lower))
  );
}

function typeLabel(f: FileItem): string {
  if (f.kind === "report" || f.format === "pdf" || f.format === "docx") return "Report";
  if (f.kind === "deck" || f.format === "pptx") return "Deck";
  if (f.kind === "sheet" || f.format === "xlsx" || f.format === "csv") return "Sheet";
  if (f.kind === "image" || f.format === "png" || f.format === "jpg" || f.format === "jpeg") return "Image";
  if (f.kind === "video" || f.format === "mp4") return "Video";
  if (f.kind === "brief") return "Brief";
  if (f.kind === "monitor") return "Monitor";
  if (f.format === "md") return "Note";
  return f.kind ? f.kind.charAt(0).toUpperCase() + f.kind.slice(1) : "File";
}

function renderFilePreview(f: FileItem) {
  const k = f.kind.toLowerCase();
  const fmt = (f.format || "").toLowerCase();

  if (k === "image" || fmt === "png" || fmt === "jpg" || fmt === "jpeg" || fmt === "webp") {
    const src = f.photoUrl || f.fileUrl;
    if (src) {
      return (
        <img
          src={src}
          alt={f.name}
          className="ph-img"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          loading="lazy"
        />
      );
    }
  }

  if (k === "video" || fmt === "mp4") {
    if (f.fileUrl) {
      return (
        <video
          src={f.fileUrl}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          muted
        />
      );
    }
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "grid",
          placeItems: "center",
          color: "var(--quiet)",
        }}
      >
        <SutaeruIcon name="play" style={{ width: 28, height: 28 }} />
      </div>
    );
  }

  let docKind: "report" | "deck" | "sheet" | "brief" | "monitor" = "report";
  if (k === "deck" || fmt === "pptx") docKind = "deck";
  else if (k === "sheet" || fmt === "xlsx" || fmt === "csv") docKind = "sheet";
  else if (k === "brief") docKind = "brief";
  else if (k === "monitor") docKind = "monitor";

  return <DocMini kind={docKind} data={f.doc || { title: f.name }} />;
}

export function FilesView({
  files,
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  storageUsedBytes,
  storageCapBytes = 10 * 1024 * 1024 * 1024,
  isUploading = false,
  uploadingFileName,
  uploadProgress = 0.65,
  view = "active",
  onViewChange,
  onUpload,
  onPreviewFile,
  onOpenFileInChat,
  onDownloadFile,
  onRenameFile,
  onMoveFile,
  onTrashFile,
  onRestoreFile,
  onDeleteFile,
  onOpenAsBrief,
  onAskSutaeru,
  className,
}: FilesViewProps) {
  const visibleFiles = files.filter((f) => (view === "active" ? !f.trashed : f.trashed));
  const filteredList = visibleFiles.filter(
    (f) => matchesFilter(f, activeFilter) && matchesSearch(f, searchQuery)
  );

  const filledSegments = Math.min(
    24,
    Math.max(0, Math.round((storageUsedBytes / storageCapBytes) * 24))
  );

  const activeFilterName =
    FILTERS.find(([id]) => id === activeFilter)?.[1] || "All";

  const renderCardMenu = (file: FileItem) => {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="file-more-btn"
            aria-label={`More actions for ${file.name}`}
            title="More actions"
            onClick={(e) => e.stopPropagation()}
          >
            <SutaeruIcon name="more" style={{ width: 14, height: 14 }} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {view === "active" ? (
            <>
              {onPreviewFile && (
                <DropdownMenuItem onClick={() => onPreviewFile(file)}>
                  <SutaeruIcon name="review" className="mr-2 h-4 w-4" />
                  Preview
                </DropdownMenuItem>
              )}
              {onRenameFile && (
                <DropdownMenuItem onClick={() => onRenameFile(file)}>
                  <SutaeruIcon name="edit" className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
              )}
              {onOpenAsBrief &&
                (file.format === "pdf" || file.format === "docx" || file.format === "md") && (
                  <DropdownMenuItem onClick={() => onOpenAsBrief(file)}>
                    <SutaeruIcon name="report" className="mr-2 h-4 w-4" />
                    Open as brief
                  </DropdownMenuItem>
                )}
              {file.threadId && onOpenFileInChat && (
                <DropdownMenuItem onClick={() => onOpenFileInChat(file)}>
                  <SutaeruIcon name="ask" className="mr-2 h-4 w-4" />
                  Open in chat
                </DropdownMenuItem>
              )}
              {file.fileUrl && onDownloadFile && (
                <DropdownMenuItem onClick={() => onDownloadFile(file)}>
                  <SutaeruIcon name="download" className="mr-2 h-4 w-4" />
                  Download
                </DropdownMenuItem>
              )}
              {onMoveFile && (
                <DropdownMenuItem onClick={() => onMoveFile(file)}>
                  <SutaeruIcon name="files" className="mr-2 h-4 w-4" />
                  Move to Space
                </DropdownMenuItem>
              )}
              {onTrashFile && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onTrashFile(file)}
                >
                  <SutaeruIcon name="delete" className="mr-2 h-4 w-4" />
                  Move to trash
                </DropdownMenuItem>
              )}
            </>
          ) : (
            <>
              {onRestoreFile && (
                <DropdownMenuItem onClick={() => onRestoreFile(file)}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restore
                </DropdownMenuItem>
              )}
              {onDeleteFile && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDeleteFile(file)}
                >
                  <SutaeruIcon name="delete" className="mr-2 h-4 w-4" />
                  Delete forever
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <section className={cn("view view-enter", className)} id="view-files">
      {/* Head */}
      <div className="files-head">
        <h1 className="title">Files</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {onViewChange && (
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className={cn("pill", view === "active" && "on")}
                aria-pressed={view === "active"}
                onClick={() => onViewChange("active")}
              >
                Active
              </button>
              <button
                type="button"
                className={cn("pill", view === "trashed" && "on")}
                aria-pressed={view === "trashed"}
                onClick={() => onViewChange("trashed")}
              >
                Trash
              </button>
            </div>
          )}
          <button
            type="button"
            className="btn ink"
            onClick={onUpload}
            aria-label="Upload files"
          >
            <SutaeruIcon name="plus" />
            Upload
          </button>
        </div>
      </div>
      <p className="lede" style={{ marginTop: 8 }}>
        Everything Sutaeru made for you, and everything you gave it.
      </p>

      {/* Storage card with 24 stepped segments */}
      <div className="card storage" role="region" aria-label="Storage usage">
        <div className="between">
          <span className="mono">Storage</span>
          <span className="mono ink tnum">
            {formatStorage(storageUsedBytes, storageCapBytes)}
          </span>
        </div>
        <div
          className="segs"
          aria-hidden="true"
          role="meter"
          aria-valuenow={storageUsedBytes}
          aria-valuemin={0}
          aria-valuemax={storageCapBytes}
        >
          {Array.from({ length: 24 }, (_, i) => (
            <i key={i} className={i < filledSegments ? "on" : ""} />
          ))}
        </div>
      </div>

      {/* Pill search */}
      <label className="search" htmlFor="fq">
        <span className="sr">Search files</span>
        <SutaeruIcon name="search" className="ico" />
        <input
          id="fq"
          placeholder="Search files"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </label>

      {/* Filter chips (horizontally scrollable) */}
      <div className="hscroll filters" role="group" aria-label="Filter">
        {FILTERS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="pill"
            aria-pressed={activeFilter === id}
            data-filter={id}
            onClick={() => onFilterChange(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* File Grid or Designed Empty State */}
      <div id="fileGrid">
        {!filteredList.length && !isUploading ? (
          <div className="panel empty">
            <FocusBrackets className="show" />
            <DitherSphere width={150} height={150} />
            <b>
              {searchQuery.trim()
                ? "No files match."
                : activeFilter === "video"
                ? "Nothing here yet."
                : "Nothing here yet."}
            </b>
            <p>
              {searchQuery.trim()
                ? `Nothing called “${searchQuery}” in ${activeFilterName}. Try fewer words or another filter.`
                : activeFilter === "video"
                ? "Videos Sutaeru makes will land here."
                : activeFilter === "all"
                ? "Documents, images and videos that Sutaeru makes will land here."
                : `${activeFilterName} Sutaeru makes will land here.`}
            </p>
            {searchQuery.trim() ? (
              <button
                type="button"
                className="btn"
                onClick={() => onSearchChange("")}
              >
                Clear search
              </button>
            ) : (
              <button
                type="button"
                className="btn ink big"
                onClick={onAskSutaeru}
              >
                Ask Sutaeru to make one
              </button>
            )}
          </div>
        ) : (
          <div className="file-grid">
            {isUploading && (
              <div
                className="file"
                role="status"
                aria-label={`Uploading ${uploadingFileName || "file"}`}
              >
                <FocusBrackets className="show" />
                <span
                  className="fp"
                  style={{
                    display: "grid",
                    placeItems: "center",
                    background: "var(--panel)",
                  }}
                >
                  <SutaeruIcon
                    name="files"
                    style={{ width: 32, height: 32, color: "var(--accent)" }}
                  />
                </span>
                <span className="fm">
                  <span className="mono">
                    <span className="live-dot pulse" style={{ marginRight: 6 }} />
                    Uploading
                  </span>
                  <b>{uploadingFileName || "site-survey-2026.docx"}</b>
                  <small>{Math.round(uploadProgress * 100)}% complete</small>
                  <span className="bar-holder">
                    <LinearDitherBar
                      progress={uploadProgress}
                      width={200}
                      height={14}
                      asCanvas
                    />
                  </span>
                  <span className="mono tnum">About 5 sec left</span>
                </span>
              </div>
            )}

            {filteredList.map((file) => (
              <div
                key={file.id}
                className="file"
                tabIndex={0}
                role="button"
                aria-label={`Open ${file.name}`}
                onClick={() => onPreviewFile?.(file)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPreviewFile?.(file);
                  }
                }}
              >
                {file.fresh && <FocusBrackets className="show" />}
                <span className="fp">{renderFilePreview(file)}</span>
                <span className="fm">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span className="mono">
                      {file.live ? (
                        <>
                          <span
                            className="live-dot pulse"
                            style={{ marginRight: 6 }}
                          />
                          Writing
                        </>
                      ) : (
                        typeLabel(file)
                      )}
                    </span>
                    {renderCardMenu(file)}
                  </div>
                  <b>{file.name}</b>
                  <small>{file.meta}</small>
                  {file.live && <LiveFileBar />}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default FilesView;
