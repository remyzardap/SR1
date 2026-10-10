import * as React from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { categoryOf, extension, formatBadge, type FileItem } from "./fileModel";

/* Type glyphs for the Files list, drawn on the 24-unit grid (the shared .ico is cut for a
   100-unit box and would blob at this size). Stroke, not fill, so one colour works in light
   and dark. */

export type FileGlyphName = "document" | "pdf" | "image" | "sheet" | "slide" | "video" | "audio" | "archive" | "file";

const GLYPHS: Record<FileGlyphName, ReactNode> = {
  document: <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4" />,
  pdf: <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 14h6M10 17.5h4" />,
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m5 17 4.5-4.5 3 3 3-3L20 16" />
    </>
  ),
  sheet: <path d="M4 5h16v14H4zM4 10h16M4 15h16M10 5v14" />,
  slide: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M8 10h8M8 14h5" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="6" width="13" height="12" rx="3" />
      <path d="M16 11l5-3v8l-5-3" />
    </>
  ),
  audio: <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />,
  archive: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <path d="M4 10h16M11 14h2" />
    </>
  ),
  file: <path d="M7 3h7l5 5v13H7zM14 3v5h5" />,
};

const VIDEO_KINDS = ["video", "clip"];
const AUDIO_KINDS = ["audio", "voice", "recording", "podcast"];

export function glyphNameFor(file: FileItem): FileGlyphName {
  const fmt = extension(file);
  const kind = (file.kind || "").toLowerCase();
  switch (categoryOf(file)) {
    case "pdfs":
      return "pdf";
    case "images":
      return "image";
    case "sheets":
      return "sheet";
    case "slides":
      return "slide";
    default:
      if (VIDEO_KINDS.includes(kind) || ["mp4", "mov", "webm", "mkv", "avi", "m4v"].includes(fmt)) return "video";
      if (AUDIO_KINDS.includes(kind) || ["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus"].includes(fmt)) return "audio";
      if (["zip", "tar", "gz", "tgz", "rar", "7z"].includes(fmt) || kind === "archive") return "archive";
      return "file";
  }
}

export function FileGlyph({ name, className }: { name: FileGlyphName; className?: string }) {
  return (
    <svg
      className={cn("fi", className)}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[name]}
    </svg>
  );
}

/**
 * The 44 px type tile: a picture for images that have one, otherwise the glyph, with the
 * extension as a badge. A file still being written shows a breathing dot instead of a badge.
 */
export function FileTypeIcon({ file, thumb = true }: { file: FileItem; thumb?: boolean }) {
  const badge = formatBadge(file);
  const src = thumb && categoryOf(file) === "images" ? file.photoUrl || file.fileUrl : undefined;
  return (
    <span className={cn("ftype", src && "thumb")}>
      {src ? <img src={src} alt="" loading="lazy" decoding="async" /> : <FileGlyph name={glyphNameFor(file)} />}
      {file.live ? (
        <i className="ftype-live" aria-hidden="true" />
      ) : badge ? (
        <em>{badge}</em>
      ) : null}
    </span>
  );
}
