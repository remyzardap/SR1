import * as React from "react";
import { RotateCcw } from "lucide-react";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FileItem } from "./fileModel";

export interface FileActions {
  onPreviewFile?: (file: FileItem) => void;
  onRenameFile?: (file: FileItem) => void;
  onOpenAsBrief?: (file: FileItem) => void;
  onOpenFileInChat?: (file: FileItem) => void;
  onDownloadFile?: (file: FileItem) => void;
  onMoveFile?: (file: FileItem) => void;
  onTrashFile?: (file: FileItem) => void;
  onRestoreFile?: (file: FileItem) => void;
  onDeleteFile?: (file: FileItem) => void;
}

const canBeBrief = (file: FileItem) => ["pdf", "docx", "doc", "md"].includes((file.format || "").toLowerCase());

/** The "…" on the right of every row: the same actions the card menu had, in the same order. */
export function FileRowMenu({ file, view, actions }: { file: FileItem; view: "active" | "trashed"; actions: FileActions }) {
  const {
    onPreviewFile,
    onRenameFile,
    onOpenAsBrief,
    onOpenFileInChat,
    onDownloadFile,
    onMoveFile,
    onTrashFile,
    onRestoreFile,
    onDeleteFile,
  } = actions;

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
              <DropdownMenuItem onSelect={() => onPreviewFile(file)}>
                <SutaeruIcon name="review" className="mr-2 h-4 w-4" />
                Preview
              </DropdownMenuItem>
            )}
            {onRenameFile && (
              <DropdownMenuItem onSelect={() => onRenameFile(file)}>
                <SutaeruIcon name="edit" className="mr-2 h-4 w-4" />
                Rename
              </DropdownMenuItem>
            )}
            {onOpenAsBrief && canBeBrief(file) && (
              <DropdownMenuItem onSelect={() => onOpenAsBrief(file)}>
                <SutaeruIcon name="report" className="mr-2 h-4 w-4" />
                Open as brief
              </DropdownMenuItem>
            )}
            {file.threadId && onOpenFileInChat && (
              <DropdownMenuItem onSelect={() => onOpenFileInChat(file)}>
                <SutaeruIcon name="ask" className="mr-2 h-4 w-4" />
                Open in chat
              </DropdownMenuItem>
            )}
            {file.fileUrl && onDownloadFile && (
              <DropdownMenuItem onSelect={() => onDownloadFile(file)}>
                <SutaeruIcon name="download" className="mr-2 h-4 w-4" />
                Download
              </DropdownMenuItem>
            )}
            {onMoveFile && (
              <DropdownMenuItem onSelect={() => onMoveFile(file)}>
                <SutaeruIcon name="files" className="mr-2 h-4 w-4" />
                Move to Space
              </DropdownMenuItem>
            )}
            {onTrashFile && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onTrashFile(file)}
              >
                <SutaeruIcon name="delete" className="mr-2 h-4 w-4" />
                Move to trash
              </DropdownMenuItem>
            )}
          </>
        ) : (
          <>
            {onRestoreFile && (
              <DropdownMenuItem onSelect={() => onRestoreFile(file)}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Restore
              </DropdownMenuItem>
            )}
            {onDeleteFile && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onDeleteFile(file)}
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
}
