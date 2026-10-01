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
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { BriefDialog } from "@/components/BriefDialog";
import { SutaeruIcon } from "@/components/SutaeruIcon";
type FileRecord = {
  id: number; name: string; format: string; kind: string; originalPrompt: string;
  styleLabel?: string | null; createdAt: Date | string; fileSizeBytes?: number | null;
  threadId?: string | null; fileUrl: string; trashed?: boolean; spaceId?: string | null;
};

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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

  const filtered = files.filter(
    (f) =>
      (view === "active" ? !f.trashed : f.trashed) &&
      (filterKind === "all" || f.kind === filterKind) &&
      (f.name.toLowerCase().includes(search.toLowerCase()) ||
        f.originalPrompt.toLowerCase().includes(search.toLowerCase()))
  );

  const KIND_LABELS: Record<string, string> = {
    all: "All",
    document: "Documents",
    image: "Images",
    video: "Videos",
    audio: "Audio",
    other: "Other",
  };

  const openRename = (file: FileRecord) => {
    setNewName(file.name);
    setRenameDialog({ open: true, file });
  };

  const openDelete = (file: FileRecord) => {
    setDeleteDialog({ open: true, file });
  };

  return (
    <div className="sk-page">
      {/* Header */}
      <div className="sk-header">
        <div>
          <h1 className="sk-h1">File Manager</h1>
          <p className="sk-sub">
            {files.length} file{files.length !== 1 ? "s" : ""} generated
          </p>
        </div>
        <div className="sk-actions">
          <button type="button" className="sk-btn" onClick={() => navigate("/atelier")}>
            New File
          </button>
        </div>
      </div>

      {/* Search + type filter */}
      <div className="sk-toolbar">
        <div className="sk-search">
          <SutaeruIcon name="search" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files by name or prompt..."
          />
        </div>
        <div className="sk-filters">
          {Object.entries(KIND_LABELS).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className={cn("sk-pill", filterKind === kind && "is-active")}
              aria-pressed={filterKind === kind}
              onClick={() => setFilterKind(kind)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* View tabs */}
      <div className="sk-filters mb-6">
        <button
          type="button"
          className={cn("sk-pill", view === "active" && "is-active")}
          aria-pressed={view === "active"}
          onClick={() => setView("active")}
        >
          Active
        </button>
        <button
          type="button"
          className={cn("sk-pill", view === "trashed" && "is-active")}
          aria-pressed={view === "trashed"}
          onClick={() => setView("trashed")}
        >
          Trash
        </button>
      </div>

      {/* File list */}
      {isLoading ? (
        <div className="sk-grid">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="sk-tile">
              <div className="sk-skeleton" style={{ minHeight: 120, borderRadius: 20 }} />
              <div className="sk-skeleton" style={{ height: 12, width: "38%" }} />
              <div className="sk-skeleton" style={{ height: 18, width: "78%" }} />
              <div className="sk-skeleton" style={{ height: 12, width: "56%" }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="sk-card">
          <div className="sk-empty">
            <span className="sk-label">
              {search ? "No files match your search" : "No files yet"}
            </span>
            <p className="sk-empty-text">
              {search
                ? "Try a different search term"
                : "Generate your first file to see it here"}
            </p>
            {!search && (
              <button
                type="button"
                className="sk-btn mt-3 self-start"
                onClick={() => navigate("/atelier")}
              >
                Generate a File
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="sk-grid">
          {filtered.map((file) => (
            <div key={file.id} className="sk-tile">
              {/* Pale preview block with static placeholder lines */}
              <div className="sk-preview">
                <div className="sk-preview-lines">
                  <span className="sk-preview-line" style={{ width: "46%" }} />
                  <span className="sk-preview-line" style={{ width: "78%" }} />
                  <span className="sk-preview-line" style={{ width: "62%" }} />
                  <span className="sk-preview-line" style={{ width: "30%" }} />
                </div>
              </div>

              <span className="sk-label">{file.kind}</span>
              <p className="sk-tile-title">{file.name}</p>
              <p className="sk-muted truncate text-xs">{file.originalPrompt}</p>
              <p className="sk-meta">
                {formatDate(file.createdAt)} · {file.format} · {formatBytes(file.fileSizeBytes)}
              </p>

              {/* Actions */}
              <div className="sk-between">
                <div className="sk-row">
                  <button type="button" className="sk-icon-btn" aria-label={`Preview ${file.name}`} title="Preview" onClick={() => setPreviewFile(file)}>
                    <SutaeruIcon name="review" />
                  </button>
                  {file.threadId && (
                    <button type="button" className="sk-icon-btn" aria-label={`Open chat for ${file.name}`} title="Open chat" onClick={() => navigate(`/chat/${file.threadId}`)}>
                      <SutaeruIcon name="ask" />
                    </button>
                  )}
                  <a className="sk-icon-btn" href={file.fileUrl} target="_blank" rel="noopener noreferrer" download aria-label={`Download ${file.name}`} title="Download">
                    <SutaeruIcon name="download" />
                  </a>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="sk-icon-btn" aria-label={`More actions for ${file.name}`} title="More actions">
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
                {file.styleLabel && (
                  <span className="sk-chip max-w-[45%] truncate">{file.styleLabel}</span>
                )}
              </div>
            </div>
          ))}
        </div>
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
        <DialogContent className="sk-dialog">
          <DialogHeader>
            <DialogTitle>Rename File</DialogTitle>
          </DialogHeader>
          <input
            className="sk-input"
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
              className="sk-btn sk-btn-ghost"
              onClick={() => setRenameDialog({ open: false, file: null })}
            >
              Cancel
            </button>
            <button
              type="button"
              className="sk-btn"
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
        <DialogContent className="sk-dialog">
          <DialogHeader>
            <DialogTitle>Delete File</DialogTitle>
          </DialogHeader>
          <p className="sk-empty-text">
            Are you sure you want to delete{" "}
            <span className="font-medium" style={{ color: "var(--art-ink)" }}>{deleteDialog.file?.name}</span>? This
            action cannot be undone.
          </p>
          <DialogFooter>
            <button
              type="button"
              className="sk-btn sk-btn-ghost"
              onClick={() => setDeleteDialog({ open: false, file: null })}
            >
              Cancel
            </button>
            <button
              type="button"
              className="sk-btn"
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
          className="sk-dialog"
          style={{ maxWidth: "min(768px, calc(100vw - 32px))" }}
        >
          <DialogHeader>
            <DialogTitle>{previewFile?.name}</DialogTitle>
          </DialogHeader>
          <div
            className="max-h-[60vh] overflow-auto rounded-[20px] p-4"
            style={{ background: "#F1EFEA" }}
          >
            {previewFile?.kind === "image" ? (
              <img src={previewFile.fileUrl} alt={previewFile.name} className="mx-auto max-h-full rounded" />
            ) : previewFile?.kind === "video" ? (
              <video src={previewFile.fileUrl} controls className="w-full rounded" />
            ) : previewFile?.kind === "audio" ? (
              <audio src={previewFile.fileUrl} controls className="w-full" />
            ) : (
              <div className="sk-empty" style={{ textAlign: "center" }}>
                <p className="sk-empty-text">Preview not available for this file type.</p>
                <a
                  className="sk-btn mt-4"
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
            <button type="button" className="sk-btn sk-btn-ghost" onClick={() => setPreviewFile(null)}>
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Space Dialog */}
      <Dialog open={moveDialog.open} onOpenChange={(open) => setMoveDialog((d) => ({ ...d, open }))}>
        <DialogContent className="sk-dialog">
          <DialogHeader>
            <DialogTitle>Move to Space</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="sk-pill w-full"
              style={{ justifyContent: "flex-start" }}
              onClick={() => moveDialog.file && moveMutation.mutate({ id: moveDialog.file.id, spaceId: null })}
            >
              No Space
            </button>
            {spaces.map((space) => (
              <button
                key={space.id}
                type="button"
                className="sk-pill w-full"
                style={{ justifyContent: "flex-start" }}
                onClick={() => moveDialog.file && moveMutation.mutate({ id: moveDialog.file.id, spaceId: space.id })}
              >
                {space.name}
              </button>
            ))}
            <div className="flex gap-2 pt-2">
              <input
                className="sk-input"
                value={newSpaceName}
                onChange={(e) => setNewSpaceName(e.target.value)}
                placeholder="New space name"
              />
              <button
                type="button"
                className="sk-btn"
                disabled={!newSpaceName.trim() || createSpaceMutation.isPending}
                onClick={() => createSpaceMutation.mutate({ name: newSpaceName })}
              >
                Create
              </button>
            </div>
          </div>
          <DialogFooter>
            <button type="button" className="sk-btn sk-btn-ghost" onClick={() => setMoveDialog({ open: false, file: null })}>
              Cancel
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
