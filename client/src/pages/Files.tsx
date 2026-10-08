import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { BriefDialog } from "@/components/BriefDialog";
import { relativeTime } from "@/lib/relativeTime";
import { FilesView, formatBytes, type FileItem } from "@/components/files/FilesView";

type FileRecord = {
  id: number;
  name: string;
  format: string;
  kind: string;
  originalPrompt: string;
  styleLabel?: string | null;
  createdAt: Date | string;
  updatedAt?: Date | string | null;
  fileSizeBytes?: number | null;
  threadId?: string | null;
  fileUrl: string;
  trashed?: boolean;
  spaceId?: string | null;
};

const STORAGE_CAP_BYTES = 10 * 1024 * 1024 * 1024;

function isWriting(file: FileRecord): boolean {
  return !file.trashed && !file.fileSizeBytes;
}

export default function Files() {
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [search, setSearch] = useState("");
  const [filterKind, setFilterKind] = useState<string>("all");
  const [view, setView] = useState<"active" | "trashed">("active");

  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0.65);

  const [renameDialog, setRenameDialog] = useState<{ open: boolean; file: FileRecord | null }>({
    open: false,
    file: null,
  });
  const [newName, setNewName] = useState("");

  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; file: FileRecord | null }>({
    open: false,
    file: null,
  });

  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);

  const [moveDialog, setMoveDialog] = useState<{ open: boolean; file: FileRecord | null }>({
    open: false,
    file: null,
  });
  const [newSpaceName, setNewSpaceName] = useState("");

  const [brief, setBrief] = useState<{
    open: boolean;
    document: { filename: string; text?: string; file?: string; mediaType?: string } | null;
  }>({ open: false, document: null });

  const utils = trpc.useUtils();

  const { data: files = [] } = trpc.files.list.useQuery();
  const { data: spaces = [] } = trpc.spaces.list.useQuery();

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
        const mediaType =
          blob.type ||
          (file.format === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/pdf");
        setBrief({ open: true, document: { filename: file.name, file: dataUrl, mediaType } });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the brief.");
    }
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;

    for (let i = 0; i < selected.length; i++) {
      const file = selected[i];
      if (file.type.startsWith("video/")) {
        const formData = new FormData();
        formData.append("video", file);
        try {
          setIsUploading(true);
          setUploadingFileName(file.name);
          setUploadProgress(0.3);
          const res = await fetch("/api/upload/video", {
            method: "POST",
            body: formData,
          });
          if (!res.ok) throw new Error(`Upload failed (${res.status})`);
          setUploadProgress(1);
          toast.success(`Uploaded ${file.name}`);
          utils.files.list.invalidate();
        } catch (err: any) {
          toast.error(err.message || "Upload failed");
        } finally {
          setIsUploading(false);
          setUploadingFileName("");
        }
      } else {
        toast.info(`File selected: ${file.name}. Ask Sutaeru in chat to process this file.`);
      }
    }
  };

  const visibleFiles = files.filter((f) => (view === "active" ? !f.trashed : f.trashed));
  const usedBytes = visibleFiles.reduce((sum, f) => sum + (f.fileSizeBytes ?? 0), 0);

  const fileMap = new Map<string | number, FileRecord>();
  files.forEach((f) => fileMap.set(f.id, f));

  const fileItems: FileItem[] = files.map((f) => ({
    id: f.id,
    name: f.name,
    kind: f.kind,
    format: f.format,
    meta: isWriting(f)
      ? "Writing..."
      : `Edited ${relativeTime(f.updatedAt ?? f.createdAt)} · ${formatBytes(f.fileSizeBytes)}${f.styleLabel ? ` · ${f.styleLabel}` : ""}`,
    fileUrl: f.fileUrl,
    fileSizeBytes: f.fileSizeBytes,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    trashed: f.trashed,
    threadId: f.threadId,
    styleLabel: f.styleLabel,
    live: isWriting(f),
  }));

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        style={{ display: "none" }}
        multiple
        aria-hidden="true"
      />

      <FilesView
        files={fileItems}
        searchQuery={search}
        onSearchChange={setSearch}
        activeFilter={filterKind}
        onFilterChange={setFilterKind}
        storageUsedBytes={usedBytes}
        storageCapBytes={STORAGE_CAP_BYTES}
        view={view}
        onViewChange={setView}
        isUploading={isUploading}
        uploadingFileName={uploadingFileName}
        uploadProgress={uploadProgress}
        onUpload={handleUploadClick}
        onPreviewFile={(item) => {
          const rec = fileMap.get(item.id);
          if (rec) setPreviewFile(rec);
        }}
        onOpenFileInChat={(item) => {
          if (item.threadId) navigate(`/chat/${item.threadId}`);
        }}
        onDownloadFile={(item) => {
          if (item.fileUrl) {
            const a = document.createElement("a");
            a.href = item.fileUrl;
            a.download = item.name;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.click();
          }
        }}
        onRenameFile={(item) => {
          const rec = fileMap.get(item.id);
          if (rec) {
            setNewName(rec.name);
            setRenameDialog({ open: true, file: rec });
          }
        }}
        onMoveFile={(item) => {
          const rec = fileMap.get(item.id);
          if (rec) setMoveDialog({ open: true, file: rec });
        }}
        onTrashFile={(item) => {
          trashMutation.mutate({ id: Number(item.id), trashed: true });
        }}
        onRestoreFile={(item) => {
          trashMutation.mutate({ id: Number(item.id), trashed: false });
        }}
        onDeleteFile={(item) => {
          const rec = fileMap.get(item.id);
          if (rec) setDeleteDialog({ open: true, file: rec });
        }}
        onOpenAsBrief={(item) => {
          const rec = fileMap.get(item.id);
          if (rec) void openAsBrief(rec);
        }}
        onAskSutaeru={() => navigate("/documents")}
      />

      {/* Document brief dialog */}
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
              <img
                src={previewFile.fileUrl}
                alt={previewFile.name}
                className="mx-auto max-h-full rounded"
              />
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
            <button
              type="button"
              className="lp-btn lp-btn-quiet"
              onClick={() => setPreviewFile(null)}
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Space Dialog */}
      <Dialog
        open={moveDialog.open}
        onOpenChange={(open) => setMoveDialog((d) => ({ ...d, open }))}
      >
        <DialogContent className="sk-dialog lp-dialog">
          <DialogHeader>
            <DialogTitle>Move to Space</DialogTitle>
          </DialogHeader>
          <div className="lp-stack">
            <button
              type="button"
              className="lp-space-row"
              onClick={() =>
                moveDialog.file && moveMutation.mutate({ id: moveDialog.file.id, spaceId: null })
              }
            >
              No Space
            </button>
            {spaces.map((space) => (
              <button
                key={space.id}
                type="button"
                className="lp-space-row"
                onClick={() =>
                  moveDialog.file &&
                  moveMutation.mutate({ id: moveDialog.file.id, spaceId: space.id })
                }
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
            <button
              type="button"
              className="lp-btn lp-btn-quiet"
              onClick={() => setMoveDialog({ open: false, file: null })}
            >
              Cancel
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
