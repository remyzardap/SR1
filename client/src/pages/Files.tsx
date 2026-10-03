import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { useLocation } from "wouter";
import { BriefDialog } from "@/components/BriefDialog";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { Chip, FocusBrackets, HalftoneRamp, LinearDitherBar, SteppedMeter } from "@/components/art";
import { PageTitle } from "@/components/chrome/PageTitle";
import { relativeTime } from "@/lib/relativeTime";
import "@/styles/list-pages.css";

type FileRecord = {
  id: number; name: string; format: string; kind: string; originalPrompt: string;
  styleLabel?: string | null; createdAt: Date | string; updatedAt?: Date | string | null;
  fileSizeBytes?: number | null; threadId?: string | null; fileUrl: string;
  trashed?: boolean; spaceId?: string | null;
};

/** Storage shown on the meter. There is no per-plan storage endpoint, so the cap is
 *  a display constant and the used figure is the real sum of this user's file sizes. */
const STORAGE_CAP_BYTES = 10 * 1024 * 1024 * 1024;

const KIND_LABELS: Record<string, string> = {
  all: "All",
  document: "Documents",
  image: "Images",
  video: "Videos",
  audio: "Audio",
  other: "Other",
};

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/**
 * A row whose bytes have not landed yet is a file that is still being written.
 * Files are stored before their row is created, so in practice this stays dark;
 * no progress percentage or countdown is invented for a finished row.
 */
function isWriting(file: FileRecord): boolean {
  return !file.trashed && !file.fileSizeBytes;
}

/** The mono type on a row: the canvas words for the real formats the app makes. */
const FORMAT_LABELS: Record<string, string> = {
  pdf: "Report",
  docx: "Report",
  md: "Note",
  xlsx: "Sheet",
  pptx: "Deck",
};

const KIND_SINGULAR: Record<string, string> = {
  document: "Document",
  image: "Image",
  video: "Video",
  audio: "Audio",
  other: "File",
};

function typeLabel(file: FileRecord): string {
  if (file.kind !== "document") return KIND_SINGULAR[file.kind] ?? "File";
  return FORMAT_LABELS[file.format] ?? "Document";
}

export default function Files() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filterKind, setFilterKind] = useState<string>("all");
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; file: FileRecord | null }>({
    open: false,
    file: null,
  });
  const [brief, setBrief] = useState<{ open: boolean; document: { filename: string; text?: string; file?: string; mediaType?: string } | null }>({ open: false, document: null });

  async function openAsBrief(file: FileRecord) {
    try {
      const res = await fetch(file.fileUrl);
      if (!res.ok) throw new Error(`Could not load the file (${res.status}).`);
      const blob = await res.blob();
      if (blob.size > 15 * 1024 * 1024) throw new Error("Files up to 15 MB are supported.");
      if (file.format === "md" || blob.type.startsWith("text/")) {
        const text = await blob.text();
        setBrief({ open: true, document: { filename: file.name, text } });
      } else {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read the file."));
          reader.readAsDataURL(blob);
        });
        const mediaType = blob.type || (file.format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf");
        setBrief({ open: true, document: { filename: file.name, file: dataUrl, mediaType } });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the brief.");
    }
  }
  const [newName, setNewName] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; file: FileRecord | null }>({
    open: false,
    file: null,
  });
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  const [view, setView] = useState<"active" | "trashed">("active");
  const [moveDialog, setMoveDialog] = useState<{ open: boolean; file: FileRecord | null }>({
    open: false,
    file: null,
  });

  const utils = trpc.useUtils();

  const { data: files = [], isLoading } = trpc.files.list.useQuery();
  const { data: spaces = [] } = trpc.spaces.list.useQuery();
  const [newSpaceName, setNewSpaceName] = useState("");

  const createSpaceMutation = trpc.spaces.create.useMutation({
    onSuccess: () => {
      toast.success("Space created");
      utils.spaces.list.invalidate();
      setNewSpaceName("");
    },
    onError: (err) => toast.error("Create space failed: " + err.message),
  });

  const renameMutation = trpc.files.rename.useMutation({
    onSuccess: () => {
      toast.success("File renamed");
      utils.files.list.invalidate();
      setRenameDialog({ open: false, file: null });
    },
    onError: (err) => toast.error("Rename failed: " + err.message),
  });

  const deleteMutation = trpc.files.delete.useMutation({
    onSuccess: () => {
      toast.success("File deleted");
      utils.files.list.invalidate();
      setDeleteDialog({ open: false, file: null });
    },
    onError: (err) => toast.error("Delete failed: " + err.message),
  });

  const trashMutation = trpc.files.setTrashed.useMutation({
    onSuccess: () => {
      toast.success(view === "active" ? "File moved to trash" : "File restored");
      utils.files.list.invalidate();
    },
    onError: (err) => toast.error("Trash action failed: " + err.message),
  });

  const moveMutation = trpc.files.move.useMutation({
    onSuccess: () => {
      toast.success("File moved");
      utils.files.list.invalidate();
      setMoveDialog({ open: false, file: null });
    },
    onError: (err) => toast.error("Move failed: " + err.message),
  });

  const visibleFiles = files.filter((f) => (view === "active" ? !f.trashed : f.trashed));
  const usedBytes = visibleFiles.reduce((sum, f) => sum + (f.fileSizeBytes ?? 0), 0);

  const filtered = files.filter(
    (f) =>
      (view === "active" ? !f.trashed : f.trashed) &&
      (filterKind === "all" || f.kind === filterKind) &&
      (f.name.toLowerCase().includes(search.toLowerCase()) ||
        f.originalPrompt.toLowerCase().includes(search.toLowerCase()))
  );

  const openRename = (file: FileRecord) => {
    setNewName(file.name);
    setRenameDialog({ open: true, file });
  };

  const openDelete = (file: FileRecord) => {
    setDeleteDialog({ open: true, file });
  };

  return (
    <div className="lp-page">
      {/* Title, view switch and the create action */}
      <div className="lp-head">
        <div className="lp-head-main">
          <PageTitle className="lp-title">Files</PageTitle>
          <p className="lp-lede">
            {files.length} file{files.length !== 1 ? "s" : ""} generated
          </p>
        </div>
        <div className="lp-actions">
          <Chip active={view === "active"} onClick={() => setView("active")}>Active</Chip>
          <Chip active={view === "trashed"} onClick={() => setView("trashed")}>Trash</Chip>
          <button type="button" className="lp-btn lp-btn-quiet lp-btn-sm" onClick={() => navigate("/documents")}>
            <SutaeruIcon name="plus" /> New file
          </button>
        </div>
      </div>

      {/* Storage */}
      <section className="lp-card lp-storage">
        <div className="lp-storage-top">
          <span className="lp-mono">Storage</span>
          <span className="lp-mono lp-mono-ink">
            {formatBytes(usedBytes)} of {formatBytes(STORAGE_CAP_BYTES)}
          </span>
        </div>
        <SteppedMeter
          value={usedBytes / STORAGE_CAP_BYTES}
          segments={20}
          variant="col"
          ariaLabel={`${formatBytes(usedBytes)} of ${formatBytes(STORAGE_CAP_BYTES)} used`}
        />
      </section>

      {/* Search + type filter */}
      <div className="lp-section">
        <div className="lp-search">
          <SutaeruIcon name="search" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files by name or prompt..."
          />
        </div>
        <div className="lp-chips lp-chips-scroll" role="group" aria-label="File type">
          {Object.entries(KIND_LABELS).map(([kind, label]) => (
            <Chip key={kind} active={filterKind === kind} onClick={() => setFilterKind(kind)}>
              {label}
            </Chip>
          ))}
        </div>
      </div>

      {/* File list */}
      {isLoading ? (
        <ul className="lp-rows" aria-label="Loading files">
          {[...Array(4)].map((_, i) => (
            <li key={i} className="lp-row">
              <div className="lp-row-main">
                <span className="lp-skeleton" style={{ height: 11, width: "26%" }} />
                <span className="lp-skeleton" style={{ height: 20, width: "68%" }} />
                <span className="lp-skeleton" style={{ height: 12, width: "34%" }} />
              </div>
            </li>
          ))}
        </ul>
      ) : filtered.length === 0 ? (
        <section className="lp-empty">
          <FocusBrackets />
          <HalftoneRamp columns={7} rows={9} className="lp-empty-mark" />
          <h2 className="lp-empty-title">
            {search ? "No files match your search." : "Nothing here yet."}
          </h2>
          <p className="lp-empty-text">
            {search
              ? "Try a different word, or clear the search."
              : "Documents, images and videos that Sutaeru makes will land here."}
          </p>
          {!search && (
            <button type="button" className="lp-btn" onClick={() => navigate("/documents")}>
              Ask Sutaeru to make one
            </button>
          )}
        </section>
      ) : (
        <ul className="lp-rows">
          {filtered.map((file) => (
            <li key={file.id} className="lp-row">
              <div className="lp-row-main">
                <span className="lp-mono">{typeLabel(file)}</span>
                <p className="lp-row-title">{file.name}</p>
                {isWriting(file) ? (
                  <LinearDitherBar progress={0} stepLabel="Writing" ariaLabel={`${file.name} is being written`} />
                ) : (
                  <span className="lp-body">
                    Edited {relativeTime(file.updatedAt ?? file.createdAt)} · {formatBytes(file.fileSizeBytes)}
                    {file.styleLabel ? ` · ${file.styleLabel}` : ""}
                  </span>
                )}
              </div>
              <div className="lp-row-side">
                <button type="button" className="lp-icon-btn" aria-label={`Preview ${file.name}`} title="Preview" onClick={() => setPreviewFile(file)}>
                  <SutaeruIcon name="review" />
                </button>
                {file.threadId && (
                  <button type="button" className="lp-icon-btn" aria-label={`Open chat for ${file.name}`} title="Open chat" onClick={() => navigate(`/chat/${file.threadId}`)}>
                    <SutaeruIcon name="ask" />
                  </button>
                )}
                <a className="lp-icon-btn" href={file.fileUrl} target="_blank" rel="noopener noreferrer" download aria-label={`Download ${file.name}`} title="Download">
                  <SutaeruIcon name="download" />
                </a>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="lp-icon-btn" aria-label={`More actions for ${file.name}`} title="More actions">
                      <SutaeruIcon name="more" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {view === "active" && (
                      <>
                        <DropdownMenuItem onClick={() => openRename(file)}>
                          <SutaeruIcon name="edit" className="mr-2 h-4 w-4" />
                          Rename
                        </DropdownMenuItem>
                        {(file.format === "pdf" || file.format === "docx" || file.format === "md") && (
                          <DropdownMenuItem onClick={() => void openAsBrief(file)}>
                            <SutaeruIcon name="report" className="mr-2 h-4 w-4" />
                            Open as brief
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => setMoveDialog({ open: true, file })}>
                          <SutaeruIcon name="files" className="mr-2 h-4 w-4" />
                          Move to Space
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => trashMutation.mutate({ id: file.id, trashed: true })}
                        >
                          <SutaeruIcon name="delete" className="mr-2 h-4 w-4" />
                          Move to trash
                        </DropdownMenuItem>
                      </>
                    )}
                    {view === "trashed" && (
                      <>
                        <DropdownMenuItem onClick={() => trashMutation.mutate({ id: file.id, trashed: false })}>
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Restore
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => openDelete(file)}
                        >
                          <SutaeruIcon name="delete" className="mr-2 h-4 w-4" />
                          Delete forever
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Document brief */}
      <BriefDialog
        open={brief.open}
        onOpenChange={(open) => setBrief((prev) => ({ ...prev, open }))}
        initialDocument={brief.document}
      />

      {/* Rename Dialog */}
      <Dialog
        open={renameDialog.open}
        onOpenChange={(open) => setRenameDialog((d) => ({ ...d, open }))}
      >
        <DialogContent className="sk-dialog lp-dialog">
          <DialogHeader>
            <DialogTitle>Rename File</DialogTitle>
          </DialogHeader>
          <input
            className="lp-field"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="File name"
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameDialog.file) {
                renameMutation.mutate({ id: renameDialog.file.id, name: newName });
              }
            }}
          />
          <DialogFooter>
            <button
              type="button"
              className="lp-btn lp-btn-quiet"
              onClick={() => setRenameDialog({ open: false, file: null })}
            >
              Cancel
            </button>
            <button
              type="button"
              className="lp-btn"
              onClick={() => {
                if (renameDialog.file) {
                  renameMutation.mutate({ id: renameDialog.file.id, name: newName });
                }
              }}
              disabled={!newName.trim() || renameMutation.isPending}
            >
              Rename
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog((d) => ({ ...d, open }))}
      >
        <DialogContent className="sk-dialog lp-dialog">
          <DialogHeader>
            <DialogTitle>Delete File</DialogTitle>
          </DialogHeader>
          <p className="lp-empty-text" style={{ maxWidth: "none", textAlign: "left" }}>
            Are you sure you want to delete{" "}
            <span style={{ color: "var(--r-ink)" }}>{deleteDialog.file?.name}</span>? This
            action cannot be undone.
          </p>
          <DialogFooter>
            <button
              type="button"
              className="lp-btn lp-btn-quiet"
              onClick={() => setDeleteDialog({ open: false, file: null })}
            >
              Cancel
            </button>
            <button
              type="button"
              className="lp-btn"
              onClick={() => {
                if (deleteDialog.file) {
                  deleteMutation.mutate({ id: deleteDialog.file.id });
                }
              }}
              disabled={deleteMutation.isPending}
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent
          className="sk-dialog lp-dialog"
          style={{ maxWidth: "min(768px, calc(100vw - 32px))" }}
        >
          <DialogHeader>
            <DialogTitle>{previewFile?.name}</DialogTitle>
          </DialogHeader>
          <div
            className="lp-report"
            style={{ maxHeight: "60vh", overflow: "auto" }}
          >
            {previewFile?.kind === "image" ? (
              <img src={previewFile.fileUrl} alt={previewFile.name} className="mx-auto max-h-full rounded" />
            ) : previewFile?.kind === "video" ? (
              <video src={previewFile.fileUrl} controls className="w-full rounded" />
            ) : previewFile?.kind === "audio" ? (
              <audio src={previewFile.fileUrl} controls className="w-full" />
            ) : (
              <div className="lp-empty" style={{ alignItems: "flex-start", textAlign: "left" }}>
                <p className="lp-empty-text">Preview not available for this file type.</p>
                <a
                  className="lp-btn lp-btn-sm"
                  href={previewFile?.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open file
                </a>
              </div>
            )}
          </div>
          <DialogFooter>
            <button type="button" className="lp-btn lp-btn-quiet" onClick={() => setPreviewFile(null)}>
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Space Dialog */}
      <Dialog open={moveDialog.open} onOpenChange={(open) => setMoveDialog((d) => ({ ...d, open }))}>
        <DialogContent className="sk-dialog lp-dialog">
          <DialogHeader>
            <DialogTitle>Move to Space</DialogTitle>
          </DialogHeader>
          <div className="lp-stack">
            <button
              type="button"
              className="lp-space-row"
              onClick={() => moveDialog.file && moveMutation.mutate({ id: moveDialog.file.id, spaceId: null })}
            >
              No Space
            </button>
            {spaces.map((space) => (
              <button
                key={space.id}
                type="button"
                className="lp-space-row"
                onClick={() => moveDialog.file && moveMutation.mutate({ id: moveDialog.file.id, spaceId: space.id })}
              >
                {space.name}
              </button>
            ))}
            <div className="lp-row-side" style={{ paddingTop: 4 }}>
              <input
                className="lp-field"
                style={{ borderRadius: "var(--r-radius-card)" }}
                value={newSpaceName}
                onChange={(e) => setNewSpaceName(e.target.value)}
                placeholder="New space name"
              />
              <button
                type="button"
                className="lp-btn"
                disabled={!newSpaceName.trim() || createSpaceMutation.isPending}
                onClick={() => createSpaceMutation.mutate({ name: newSpaceName })}
              >
                Create
              </button>
            </div>
          </div>
          <DialogFooter>
            <button type="button" className="lp-btn lp-btn-quiet" onClick={() => setMoveDialog({ open: false, file: null })}>
              Cancel
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
