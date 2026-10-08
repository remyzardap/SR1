import type { FileItem } from "@/components/files/FilesView";

export const SAMPLE_FILES: FileItem[] = [
  {
    id: 1,
    kind: "report",
    name: "Off grid solar cost per kWh",
    meta: "Edited 2 h ago · 14 sources",
    fresh: true,
    sourcesCount: 14,
    doc: {
      title: "Off grid solar cost per kWh",
      kicker: "Research report",
      cover: "cov-solar",
      figs: [
        ["Low", "0.28"],
        ["High", "0.45"],
        ["Sources", "14"],
      ],
      bars: [0.9, 0.74, 0.62, 0.5],
      meta: "Oct 2026 · 14 sources",
    },
  },
  {
    id: 2,
    kind: "deck",
    name: "TGWI investor update Q3",
    meta: "Yesterday · 18 slides",
    doc: {
      title: "TGWI investor update Q3",
      kicker: "TGWI · October 2026",
      cover: "cov-jakarta-bw",
      meta: "01 / 18",
    },
  },
  {
    id: 3,
    kind: "sheet",
    name: "Villa BOQ and budget",
    meta: "3 days ago · 6 tabs",
    doc: {
      title: "Villa BOQ and budget",
      kicker: "Site · Seminyak",
      cover: "cov-villa",
    },
  },
  {
    id: 4,
    kind: "image",
    name: "Ceramic mug, morning light",
    meta: "Gemini · 1:1",
    photoUrl: "/studio/t/light-window.webp",
  },
  {
    id: 5,
    kind: "report",
    name: "Clay thermal storage review",
    meta: "Last week · 22 sources",
    sourcesCount: 22,
    doc: {
      title: "Clay thermal storage review",
      kicker: "Thermal research",
      cover: "cov-clay",
      figs: [
        ["Sources", "22"],
        ["Cycles", "4,000"],
        ["Saved", "18%"],
      ],
      bars: [0.55, 0.7, 0.82, 0.95],
      meta: "Oct 2026 · 22 sources",
    },
  },
  {
    id: 6,
    kind: "deck",
    name: "Kopdes PLTS proposal",
    meta: "2 weeks ago · 12 slides",
    doc: {
      title: "Kopdes PLTS proposal",
      kicker: "Koperasi desa · 2026",
      cover: "cov-panels",
      meta: "01 / 12",
    },
  },
  {
    id: 7,
    kind: "image",
    name: "Night lamp, film look",
    meta: "OpenAI · 4:5",
    photoUrl: "/studio/t/light-night.webp",
  },
  {
    id: 8,
    kind: "report",
    name: "Weekly market brief",
    meta: "Step 3 of 5",
    live: true,
    doc: {
      title: "Weekly market brief",
      kicker: "Monday edition",
      cover: "cov-jakarta",
      figs: [
        ["IDX", "+1.2%"],
        ["Rupiah", "15,640"],
        ["Coal", "Down 3%"],
      ],
      bars: [0.4, 0.5, 0.6, 0.8],
      meta: "Step 3 of 5",
    },
  },
];

export interface FilesLabStateConfig {
  name: string;
  label: string;
  files: FileItem[];
  searchQuery: string;
  activeFilter: string;
  storageUsedBytes: number;
  storageCapBytes: number;
  isUploading?: boolean;
  uploadingFileName?: string;
  uploadProgress?: number;
}

const STORAGE_CAP = 10 * 1024 * 1024 * 1024; // 10 GB
const STORAGE_STANDARD = 2.4 * 1024 * 1024 * 1024; // 2.4 GB (6 of 24 segments)
const STORAGE_NEARLY_FULL = 9.4 * 1024 * 1024 * 1024; // 9.4 GB (23 of 24 segments)

export const FILES_LAB_STATES: Record<string, FilesLabStateConfig> = {
  populated: {
    name: "populated",
    label: "Populated",
    files: SAMPLE_FILES,
    searchQuery: "",
    activeFilter: "all",
    storageUsedBytes: STORAGE_STANDARD,
    storageCapBytes: STORAGE_CAP,
  },
  filtered: {
    name: "filtered",
    label: "Filtered (Decks)",
    files: SAMPLE_FILES,
    searchQuery: "",
    activeFilter: "deck",
    storageUsedBytes: STORAGE_STANDARD,
    storageCapBytes: STORAGE_CAP,
  },
  searching_no_match: {
    name: "searching_no_match",
    label: "Search No Match",
    files: SAMPLE_FILES,
    searchQuery: "quantum battery",
    activeFilter: "all",
    storageUsedBytes: STORAGE_STANDARD,
    storageCapBytes: STORAGE_CAP,
  },
  empty_per_kind: {
    name: "empty_per_kind",
    label: "Empty (Videos)",
    files: SAMPLE_FILES,
    searchQuery: "",
    activeFilter: "video",
    storageUsedBytes: STORAGE_STANDARD,
    storageCapBytes: STORAGE_CAP,
  },
  uploading: {
    name: "uploading",
    label: "Uploading",
    files: SAMPLE_FILES,
    searchQuery: "",
    activeFilter: "all",
    storageUsedBytes: STORAGE_STANDARD,
    storageCapBytes: STORAGE_CAP,
    isUploading: true,
    uploadingFileName: "site-survey-2026.docx",
    uploadProgress: 0.65,
  },
  writing: {
    name: "writing",
    label: "Writing Live",
    files: [SAMPLE_FILES[7]], // Only the live writing file
    searchQuery: "",
    activeFilter: "all",
    storageUsedBytes: STORAGE_STANDARD,
    storageCapBytes: STORAGE_CAP,
  },
  storage_nearly_full: {
    name: "storage_nearly_full",
    label: "Storage Nearly Full",
    files: SAMPLE_FILES,
    searchQuery: "",
    activeFilter: "all",
    storageUsedBytes: STORAGE_NEARLY_FULL,
    storageCapBytes: STORAGE_CAP,
  },
};
