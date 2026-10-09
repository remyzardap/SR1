import type { FileFilterId, FileItem, FileSort } from "@/components/files/fileModel";

/* Fixtures for /__lab/files. Dates are stamped relative to "now" when the module loads, so the
   list always reads Today / Yesterday / 3 days ago the way a real account does. */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.now();
const KB = 1024;
const MB = 1024 * KB;

const ago = (ms: number) => new Date(NOW - ms).toISOString();

export const SAMPLE_FILES: FileItem[] = [
  {
    id: 1,
    name: "Bakery loyalty card proposal",
    kind: "document",
    format: "docx",
    fileSizeBytes: 38 * KB,
    createdAt: ago(3 * HOUR),
    updatedAt: ago(2 * HOUR),
    fileUrl: "/files/bakery-loyalty-card.docx",
    threadId: "t-bakery",
  },
  {
    id: 2,
    name: "Rooftop solar payback report",
    kind: "report",
    format: "pdf",
    fileSizeBytes: 1.2 * MB,
    createdAt: ago(2 * DAY),
    updatedAt: ago(1 * DAY),
    fileUrl: "/files/rooftop-solar-payback.pdf",
    threadId: "t-solar",
    sourcesCount: 14,
  },
  {
    id: 3,
    name: "Coffee, golden hour",
    kind: "image",
    format: "png",
    fileSizeBytes: 2.4 * MB,
    createdAt: ago(3 * DAY),
    fileUrl: "/studio/t/light-window.webp",
    photoUrl: "/studio/t/light-window.webp",
  },
  {
    id: 4,
    name: "City comparison",
    kind: "sheet",
    format: "xlsx",
    fileSizeBytes: 21 * KB,
    createdAt: ago(4 * DAY),
    updatedAt: ago(4 * DAY),
    fileUrl: "/files/city-comparison.xlsx",
  },
  {
    id: 5,
    name: "Studio walkthrough",
    kind: "video",
    format: "mp4",
    fileSizeBytes: 18 * MB,
    createdAt: ago(6 * DAY),
    fileUrl: "/files/studio-walkthrough.mp4",
  },
  {
    id: 6,
    name: "Solar pitch deck for the Bandung co-operative",
    kind: "deck",
    format: "pptx",
    fileSizeBytes: 3.1 * MB,
    createdAt: ago(8 * DAY),
    updatedAt: ago(7 * DAY),
    fileUrl: "/files/solar-pitch-deck.pptx",
    threadId: "t-bandung",
  },
  {
    id: 7,
    name: "Clay thermal storage review",
    kind: "report",
    format: "md",
    fileSizeBytes: 14 * KB,
    createdAt: ago(12 * DAY),
    fileUrl: "/files/clay-thermal-review.md",
    sourcesCount: 22,
    styleLabel: "Quiet",
  },
  {
    id: 8,
    name: "Night lamp, film look",
    kind: "image",
    format: "webp",
    fileSizeBytes: 1.8 * MB,
    createdAt: ago(13 * DAY),
    fileUrl: "/studio/t/light-night.webp",
    photoUrl: "/studio/t/light-night.webp",
  },
  {
    id: 9,
    name: "Site voice note — Seminyak",
    kind: "audio",
    format: "m4a",
    fileSizeBytes: 4 * MB,
    createdAt: ago(16 * DAY),
    fileUrl: "/files/site-voice-note.m4a",
  },
  {
    id: 10,
    name: "Villa BOQ and budget",
    kind: "sheet",
    format: "csv",
    fileSizeBytes: 6 * KB,
    createdAt: ago(20 * DAY),
    fileUrl: "/files/villa-boq.csv",
  },
  {
    id: 11,
    name: "Original photo roll, villa site",
    kind: "other",
    format: "zip",
    fileSizeBytes: 44 * MB,
    createdAt: ago(26 * DAY),
    fileUrl: "/files/villa-roll.zip",
  },
  {
    id: 12,
    name: "Weekly market brief",
    kind: "report",
    format: "md",
    live: true,
    fileSizeBytes: null,
    createdAt: ago(30 * MIN),
    fileUrl: "/files/weekly-market-brief.md",
    threadId: "t-market",
  },
  {
    id: 13,
    name: "Suppliers shortlist",
    kind: "document",
    format: "docx",
    fileSizeBytes: 52 * KB,
    createdAt: ago(34 * DAY),
    trashed: true,
    fileUrl: "/files/suppliers-shortlist.docx",
  },
];

const LIVE_FILE = SAMPLE_FILES.find((f) => f.live)!;
const TRASHED_FILE = SAMPLE_FILES.find((f) => f.trashed)!;

export interface FilesLabStateConfig {
  name: string;
  label: string;
  files: FileItem[];
  query: string;
  filter: FileFilterId;
  sort: FileSort;
  view: "active" | "trashed";
  storageUsedBytes?: number;
  storageCapBytes: number;
  isUploading?: boolean;
  uploadingFileName?: string;
  uploadProgress?: number;
}

const STORAGE_CAP = 10 * 1024 * 1024 * 1024; // 10 GB
const DATE_DESC: FileSort = { key: "date", dir: "desc" };

export const FILES_LAB_STATES: Record<string, FilesLabStateConfig> = {
  populated: {
    name: "populated",
    label: "Populated",
    files: SAMPLE_FILES,
    query: "",
    filter: "all",
    sort: DATE_DESC,
    view: "active",
    storageCapBytes: STORAGE_CAP,
  },
  documents: {
    name: "documents",
    label: "Documents",
    files: SAMPLE_FILES,
    query: "",
    filter: "documents",
    sort: DATE_DESC,
    view: "active",
    storageCapBytes: STORAGE_CAP,
  },
  images: {
    name: "images",
    label: "Images",
    files: SAMPLE_FILES,
    query: "",
    filter: "images",
    sort: DATE_DESC,
    view: "active",
    storageCapBytes: STORAGE_CAP,
  },
  sorted_by_size: {
    name: "sorted_by_size",
    label: "By size",
    files: SAMPLE_FILES,
    query: "",
    filter: "all",
    sort: { key: "size", dir: "desc" },
    view: "active",
    storageCapBytes: STORAGE_CAP,
  },
  sorted_by_name: {
    name: "sorted_by_name",
    label: "By name",
    files: SAMPLE_FILES,
    query: "",
    filter: "all",
    sort: { key: "name", dir: "asc" },
    view: "active",
    storageCapBytes: STORAGE_CAP,
  },
  searching_no_match: {
    name: "searching_no_match",
    label: "Search No Match",
    files: SAMPLE_FILES,
    query: "quantum battery",
    filter: "all",
    sort: DATE_DESC,
    view: "active",
    storageCapBytes: STORAGE_CAP,
  },
  empty_per_kind: {
    name: "empty_per_kind",
    label: "Empty (Sheets)",
    files: SAMPLE_FILES.filter((f) => f.kind !== "sheet" && f.kind !== "deck"),
    query: "",
    filter: "sheets",
    sort: DATE_DESC,
    view: "active",
    storageCapBytes: STORAGE_CAP,
  },
  uploading: {
    name: "uploading",
    label: "Uploading",
    files: SAMPLE_FILES,
    query: "",
    filter: "all",
    sort: DATE_DESC,
    view: "active",
    storageCapBytes: STORAGE_CAP,
    isUploading: true,
    uploadingFileName: "site-survey-2026.docx",
    uploadProgress: 0.65,
  },
  writing: {
    name: "writing",
    label: "Writing Live",
    files: [LIVE_FILE],
    query: "",
    filter: "all",
    sort: DATE_DESC,
    view: "active",
    storageCapBytes: STORAGE_CAP,
  },
  trashed: {
    name: "trashed",
    label: "Trash",
    files: [TRASHED_FILE],
    query: "",
    filter: "all",
    sort: DATE_DESC,
    view: "trashed",
    storageCapBytes: STORAGE_CAP,
  },
  storage_nearly_full: {
    name: "storage_nearly_full",
    label: "Storage Nearly Full",
    files: SAMPLE_FILES,
    query: "",
    filter: "all",
    sort: DATE_DESC,
    view: "active",
    storageUsedBytes: 9.4 * 1024 * 1024 * 1024,
    storageCapBytes: STORAGE_CAP,
  },
};
