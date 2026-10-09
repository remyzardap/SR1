import * as React from "react";
import { cn } from "@/lib/utils";
import { FileTypeIcon } from "./FileTypeIcon";
import { FileLiveBar } from "./FileLiveBar";
import { FileRowMenu, type FileActions } from "./FileRowMenu";
import { metaLine, type FileItem } from "./fileModel";

/**
 * One Drive-style row: the type tile, the whole file name (it wraps, never truncates), and the
 * "type · size · date" line under it. The row itself opens the file; the "…" is a sibling, so
 * there is never a button inside a button.
 */
export function FileRow({
  file,
  view = "active",
  actions = {},
  onOpen,
  now,
  className,
}: {
  file: FileItem;
  view?: "active" | "trashed";
  actions?: FileActions;
  onOpen?: (file: FileItem) => void;
  now?: Date;
  className?: string;
}) {
  const meta = metaLine(file, now);

  return (
    <li className={cn("frow-wrap", file.live && "is-live", className)} data-file={String(file.id)}>
      <button
        type="button"
        className="frow"
        aria-label={onOpen ? `Open ${file.name}, ${meta}` : undefined}
        onClick={() => onOpen?.(file)}
      >
        <FileTypeIcon file={file} />
        <span className="ft">
          <b>{file.name}</b>
          <small>
            {file.live && <span className="live-dot" aria-hidden="true" />}
            {meta}
          </small>
          {file.live && <FileLiveBar />}
        </span>
      </button>
      <span className="fend">
        <FileRowMenu file={file} view={view} actions={actions} />
      </span>
    </li>
  );
}
