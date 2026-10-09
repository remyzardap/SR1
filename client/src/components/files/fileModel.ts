import { relativeTime } from "@/lib/relativeTime";

/* The rules behind the Files list: what type a file is, which chip keeps it, how rows sort,
   and the "type · size · date" line under each name. Pure, so the page, the lab and the tests
   all read one source of truth. */

export interface FileItem {
  id: string | number;
  name: string;
  /** Server kind: "report" | "deck" | "sheet" | "image" | "video" | "audio" | "brief" | "monitor" | "document" | "other". */
  kind: string;
  /** Extension without the dot, e.g. "docx". */
  format?: string;
  fileUrl?: string;
  photoUrl?: string;
  /** Still being written by Sutaeru: no size yet, live bar instead. */
  live?: boolean;
  fileSizeBytes?: number | null;
  createdAt?: Date | string;
  updatedAt?: Date | string | null;
  trashed?: boolean;
  threadId?: string | null;
  sourcesCount?: number;
  styleLabel?: string | null;
  /** @deprecated the list builds its own meta line from type, size and date. */
  meta?: string;
  doc?: any;
  fresh?: boolean;
}

export type FileFilterId = "all" | "documents" | "images" | "sheets" | "slides" | "pdfs" | "other";
export type FileCategory = Exclude<FileFilterId, "all">;

export const TYPE_FILTERS: { id: FileFilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "documents", label: "Documents" },
  { id: "images", label: "Images" },
  { id: "sheets", label: "Sheets" },
  { id: "slides", label: "Slides" },
  { id: "pdfs", label: "PDFs" },
  { id: "other", label: "Other" },
];

export const CATEGORY_LABELS: Record<FileCategory, string> = {
  documents: "Documents",
  images: "Images",
  sheets: "Sheets",
  slides: "Slides",
  pdfs: "PDFs",
  other: "Other",
};

export type FileSortKey = "name" | "date" | "size";
export type FileSortDir = "asc" | "desc";

export interface FileSort {
  key: FileSortKey;
  dir: FileSortDir;
}

export const SORT_KEYS: { id: FileSortKey; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "date", label: "Date" },
  { id: "size", label: "Size" },
];

const IMAGE_FORMATS = ["png", "jpg", "jpeg", "webp", "gif", "heic", "heif", "avif", "bmp", "tiff", "svg"];
const SHEET_FORMATS = ["xlsx", "xls", "xlsm", "csv", "tsv", "ods", "numbers"];
const SLIDE_FORMATS = ["pptx", "ppt", "key", "odp"];
const DOC_FORMATS = ["docx", "doc", "md", "markdown", "txt", "rtf", "odt", "pages", "tex", "epub"];
const VIDEO_FORMATS = ["mp4", "mov", "webm", "mkv", "avi", "m4v"];
const AUDIO_FORMATS = ["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus"];
const ARCHIVE_FORMATS = ["zip", "tar", "gz", "tgz", "rar", "7z"];

const IMAGE_KINDS = ["image", "photo", "picture"];
const SHEET_KINDS = ["sheet", "spreadsheet", "data"];
const SLIDE_KINDS = ["deck", "slides", "presentation"];
const DOC_KINDS = ["report", "document", "doc", "brief", "monitor", "note", "article", "summary"];
const VIDEO_KINDS = ["video", "clip"];
const AUDIO_KINDS = ["audio", "voice", "recording", "podcast"];

function inList(list: string[], value: string | undefined | null): boolean {
  if (!value) return false;
  return list.includes(value.trim().toLowerCase().replace(/^\./, ""));
}

export function extension(file: FileItem): string {
  return (file.format || "").trim().toLowerCase().replace(/^\./, "");
}

function kind(file: FileItem): string {
  return (file.kind || "").trim().toLowerCase();
}

/** The chip a file belongs to. Extension beats kind: a "report" delivered as a PDF is a PDF. */
export function categoryOf(file: FileItem): FileCategory {
  const fmt = extension(file);
  const k = kind(file);
  if (fmt === "pdf" || k === "pdf") return "pdfs";
  if (inList(IMAGE_FORMATS, fmt) || inList(IMAGE_KINDS, k)) return "images";
  if (inList(SHEET_FORMATS, fmt) || inList(SHEET_KINDS, k)) return "sheets";
  if (inList(SLIDE_FORMATS, fmt) || inList(SLIDE_KINDS, k)) return "slides";
  if (inList(DOC_FORMATS, fmt) || inList(DOC_KINDS, k)) return "documents";
  return "other";
}

/** Words for the meta line and the row's aria-label. Never a vendor or model name. */
export function typeLabel(file: FileItem): string {
  const fmt = extension(file);
  const k = kind(file);
  switch (categoryOf(file)) {
    case "pdfs":
      return "PDF";
    case "images":
      return fmt === "svg" ? "Vector image" : "Image";
    case "sheets":
      return fmt === "csv" || fmt === "tsv" ? "CSV" : "Spreadsheet";
    case "slides":
      return "Slides";
    case "documents":
      if (fmt === "docx" || fmt === "doc") return "Word document";
      if (fmt === "md" || fmt === "markdown") return "Note";
      if (fmt === "txt" || fmt === "rtf") return "Text file";
      if (k === "report") return "Report";
      if (k === "brief") return "Brief";
      if (k === "monitor") return "Monitor";
      return "Document";
    default:
      if (inList(VIDEO_FORMATS, fmt) || inList(VIDEO_KINDS, k)) return "Video";
      if (inList(AUDIO_FORMATS, fmt) || inList(AUDIO_KINDS, k)) return "Audio";
      if (inList(ARCHIVE_FORMATS, fmt) || k === "archive") return "Archive";
      return fmt ? `${fmt.toUpperCase()} file` : "File";
  }
}

/** The small badge on the type icon: DOCX, PDF, PNG. Null when there is no extension to show. */
export function formatBadge(file: FileItem): string | null {
  const fmt = extension(file);
  if (!fmt) return null;
  return fmt.toUpperCase().slice(0, 5);
}

/** Newest meaningful stamp: an edit if there was one, the creation date otherwise. */
export function dateOf(file: FileItem): Date | null {
  const value = file.updatedAt ?? file.createdAt;
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local calendar day, so a file edited at 23:00 yesterday never reads as "Today". */
function dayNumber(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / DAY_MS);
}

/** "Today", "Yesterday", "3 days ago", then the plain date (relativeTime's own fallback). */
export function dateLabel(file: FileItem, now: Date = new Date()): string {
  const date = dateOf(file);
  if (!date) return "";
  const days = dayNumber(now) - dayNumber(date);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return capitalize(relativeTime(date, now));
}

/** Drops the ".0" a round size would otherwise carry: "38 KB", not "38.0 KB". */
function trimZero(size: string): string {
  return size.replace(/(\d)\.0(?= [KMGT]?B)/, "$1");
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return trimZero(`${(bytes / 1024).toFixed(1)} KB`);
  if (bytes < 1024 * 1024 * 1024) return trimZero(`${(bytes / 1024 / 1024).toFixed(1)} MB`);
  return trimZero(`${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`);
}

export function formatStorage(usedBytes: number, capBytes: number): string {
  return `${formatBytes(usedBytes)} of ${formatBytes(capBytes)}`;
}

/** "PDF · 1.2 MB · Yesterday". A file still being written has no size yet, so it says "Writing". */
export function metaLine(file: FileItem, now: Date = new Date()): string {
  const parts = [file.live ? "Writing" : typeLabel(file)];
  if (!file.live && file.fileSizeBytes && file.fileSizeBytes > 0) parts.push(formatBytes(file.fileSizeBytes));
  const when = dateLabel(file, now);
  if (when) parts.push(when);
  return parts.join(" · ");
}

function matchesQuery(file: FileItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    file.name.toLowerCase().includes(q) ||
    kind(file).includes(q) ||
    extension(file).includes(q) ||
    typeLabel(file).toLowerCase().includes(q)
  );
}

export function matchesFilter(file: FileItem, filter: FileFilterId): boolean {
  return filter === "all" || categoryOf(file) === filter;
}

/** Chips first, then the search box. Order is left to sortFiles. */
export function filterFiles(files: FileItem[], filter: FileFilterId, query = ""): FileItem[] {
  return files.filter((f) => matchesFilter(f, filter) && matchesQuery(f, query));
}

function compareName(a: FileItem, b: FileItem): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

function compareDate(a: FileItem, b: FileItem): number {
  const x = dateOf(a)?.getTime() ?? 0;
  const y = dateOf(b)?.getTime() ?? 0;
  return x - y;
}

function compareSize(a: FileItem, b: FileItem): number {
  return (a.fileSizeBytes ?? 0) - (b.fileSizeBytes ?? 0);
}

/**
 * A new array in the chosen order. Ties always fall back to the name, so two files edited in the
 * same second or with no size never swap places between renders.
 */
export function sortFiles(files: FileItem[], sort: FileSort): FileItem[] {
  const compare = sort.key === "name" ? compareName : sort.key === "date" ? compareDate : compareSize;
  const step = sort.dir === "asc" ? 1 : -1;
  return [...files].sort((a, b) => {
    const primary = compare(a, b) * step;
    if (primary !== 0) return primary;
    return compareName(a, b);
  });
}

/** One word for the sort button, in the order that people actually ask for. */
export function sortLabel(sort: FileSort): string {
  if (sort.key === "date") return sort.dir === "desc" ? "Newest" : "Oldest";
  if (sort.key === "size") return sort.dir === "desc" ? "Largest" : "Smallest";
  return sort.dir === "asc" ? "Name A–Z" : "Name Z–A";
}

/** Where the arrow is pointing, for the sort menu's own label. */
export function sortDirLabel(sort: FileSort): string {
  if (sort.key === "name") return sort.dir === "asc" ? "A to Z" : "Z to A";
  if (sort.key === "date") return sort.dir === "desc" ? "Newest first" : "Oldest first";
  return sort.dir === "desc" ? "Largest first" : "Smallest first";
}

export interface StorageSlice {
  id: FileCategory;
  label: string;
  bytes: number;
  count: number;
}

/** Per-type totals for the storage fold, biggest first, empty types left out. */
export function storageBreakdown(files: FileItem[]): StorageSlice[] {
  const totals = new Map<FileCategory, StorageSlice>();
  for (const file of files) {
    if (file.trashed) continue;
    const id = categoryOf(file);
    const slice = totals.get(id) ?? { id, label: CATEGORY_LABELS[id], bytes: 0, count: 0 };
    slice.bytes += file.fileSizeBytes ?? 0;
    slice.count += 1;
    totals.set(id, slice);
  }
  return [...totals.values()].sort((a, b) => b.bytes - a.bytes || a.label.localeCompare(b.label));
}

export function usedBytes(files: FileItem[]): number {
  return files.reduce((sum, f) => (f.trashed ? sum : sum + (f.fileSizeBytes ?? 0)), 0);
}
