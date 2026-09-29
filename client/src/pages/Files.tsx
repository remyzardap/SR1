import { PAGE_BG, NOISE_OVERLAY, CSS_ANIM } from '@/lib/design';
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  FileText,
  Table,
  Presentation,
  FileCode,
  Search,
  MoreVertical,
  Download,
  Pencil,
  Trash2,
  Plus,
  FolderOpen,
  MessageSquare,
  Eye,
  RotateCcw,
  Folder,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { BriefDialog } from "@/components/BriefDialog";
import { SutaeruIcon } from "@/components/SutaeruIcon";
type FileRecord = {
  id: number; name: string; format: string; kind: string; originalPrompt: string;
  styleLabel?: string | null; createdAt: Date | string; fileSizeBytes?: number | null;
  threadId?: string | null; fileUrl: string; trashed?: boolean; spaceId?: string | null;
};

const FORMAT_ICON: Record<string, React.ElementType> = {
  pdf: FileText,
  docx: FileText,
  xlsx: Table,
  pptx: Presentation,
  md: FileCode,
};

const FORMAT_COLOR: Record<string, string> = {
  pdf: "bg-secondary text-foreground", docx: "bg-secondary text-foreground",
  xlsx: "bg-secondary text-foreground", pptx: "bg-secondary text-foreground", md: "bg-secondary text-foreground",
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
    <div className="sutaeru-editorial-page mx-auto max-w-5xl px-3 py-6 sm:px-4 sm:py-8">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-700 text-foreground">File Manager</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {files.length} file{files.length !== 1 ? "s" : ""} generated
          </p>
        </div>
        <Button onClick={() => navigate("/generate")}>
          <SutaeruIcon name="plus" className="mr-2 h-4 w-4" />
          New File
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <SutaeruIcon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search files by name or prompt..."
          className="pl-9"
        />
      </div>

      {/* Type filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(KIND_LABELS).map(([kind, label]) => (
          <Button
            key={kind}
            size="sm"
            variant={filterKind === kind ? "default" : "outline"}
            onClick={() => setFilterKind(kind)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* View tabs */}
      <div className="mb-6 flex gap-2">
        <Button size="sm" variant={view === "active" ? "default" : "outline"} onClick={() => setView("active")}>
          Active
        </Button>
        <Button size="sm" variant={view === "trashed" ? "default" : "outline"} onClick={() => setView("trashed")}>
          Trash
        </Button>
      </div>

      {/* File list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
             <SutaeruIcon name="files" className="h-8 w-8" />
          </div>
          <div>
            <p className="font-medium text-foreground">
              {search ? "No files match your search" : "No files yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search
                ? "Try a different search term"
                : "Generate your first file to see it here"}
            </p>
          </div>
          {!search && (
            <Button onClick={() => navigate("/generate")}>
               <SutaeruIcon name="plus" className="mr-2 h-4 w-4" />
              Generate a File
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((file) => {
            const Icon = FORMAT_ICON[file.format] ?? FileText;
            const colorClass = FORMAT_COLOR[file.format] ?? "bg-secondary text-foreground";
            return (
              <div
                key={file.id}
                 className="group flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-3 sm:p-4 transition-colors hover:border-primary/30 hover:bg-accent/30"
              >
                {/* Icon */}
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold", colorClass)}>
                  <Icon className="h-5 w-5" />
                </div>

                {/* Info */}
                 <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-foreground">{file.name}</p>
                    <Badge variant="secondary" className="shrink-0 text-xs uppercase">
                      {file.format}
                    </Badge>
                    {file.styleLabel && (
                      <Badge variant="outline" className="hidden shrink-0 text-xs sm:inline-flex">
                        {file.styleLabel}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {file.originalPrompt}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatDate(file.createdAt)}</span>
                    <span>{formatBytes(file.fileSizeBytes)}</span>
                  </div>
                </div>

                {/* Actions */}
                 <div className="flex w-full shrink-0 items-center justify-end gap-1 border-t border-border pt-2 sm:w-auto sm:border-0 sm:pt-0 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                   <Button size="icon" variant="ghost" aria-label={`Preview ${file.name}`} title="Preview" onClick={() => setPreviewFile(file)}>
                     <SutaeruIcon name="review" className="h-4 w-4" />
                  </Button>
                  {file.threadId && (
                     <Button size="icon" variant="ghost" aria-label={`Open chat for ${file.name}`} title="Open chat" onClick={() => navigate(`/chat/${file.threadId}`)}>
                       <SutaeruIcon name="ask" className="h-4 w-4" />
                    </Button>
                  )}
                   <Button asChild size="icon" variant="ghost">
                     <a href={file.fileUrl} target="_blank" rel="noopener noreferrer" download aria-label={`Download ${file.name}`} title="Download">
                       <SutaeruIcon name="download" className="h-4 w-4" />
                    </a>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                       <Button size="icon" variant="ghost" aria-label={`More actions for ${file.name}`} title="More actions">
                         <SutaeruIcon name="more" className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {view === "active" && (
                        <>
                          <DropdownMenuItem onClick={() => openRename(file)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Rename
                          </DropdownMenuItem>
                          {(file.format === "pdf" || file.format === "docx" || file.format === "md") && (
                            <DropdownMenuItem onClick={() => void openAsBrief(file)}>
                              <FileText className="mr-2 h-4 w-4" />
                              Open as brief
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => setMoveDialog({ open: true, file })}>
                            <Folder className="mr-2 h-4 w-4" />
                            Move to Space
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => trashMutation.mutate({ id: file.id, trashed: true })}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
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
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete forever
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename File</DialogTitle>
          </DialogHeader>
          <Input
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
            <Button
              variant="outline"
              onClick={() => setRenameDialog({ open: false, file: null })}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (renameDialog.file) {
                  renameMutation.mutate({ id: renameDialog.file.id, name: newName });
                }
              }}
              disabled={!newName.trim() || renameMutation.isPending}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog((d) => ({ ...d, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete File</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">{deleteDialog.file?.name}</span>? This
            action cannot be undone.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, file: null })}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteDialog.file) {
                  deleteMutation.mutate({ id: deleteDialog.file.id });
                }
              }}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{previewFile?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto rounded-lg border bg-muted p-4">
            {previewFile?.kind === "image" ? (
              <img src={previewFile.fileUrl} alt={previewFile.name} className="mx-auto max-h-full rounded" />
            ) : previewFile?.kind === "video" ? (
              <video src={previewFile.fileUrl} controls className="w-full rounded" />
            ) : previewFile?.kind === "audio" ? (
              <audio src={previewFile.fileUrl} controls className="w-full" />
            ) : (
              <div className="text-center text-sm text-muted-foreground">
                <p>Preview not available for this file type.</p>
                <Button asChild className="mt-4" size="sm">
                  <a href={previewFile?.fileUrl} target="_blank" rel="noopener noreferrer">
                    Open file
                  </a>
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewFile(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Space Dialog */}
      <Dialog open={moveDialog.open} onOpenChange={(open) => setMoveDialog((d) => ({ ...d, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to Space</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => moveDialog.file && moveMutation.mutate({ id: moveDialog.file.id, spaceId: null })}
            >
              No Space
            </Button>
            {spaces.map((space) => (
              <Button
                key={space.id}
                variant="outline"
                className="w-full justify-start"
                onClick={() => moveDialog.file && moveMutation.mutate({ id: moveDialog.file.id, spaceId: space.id })}
              >
                {space.name}
              </Button>
            ))}
            <div className="flex gap-2 pt-2">
              <Input
                value={newSpaceName}
                onChange={(e) => setNewSpaceName(e.target.value)}
                placeholder="New space name"
              />
              <Button
                disabled={!newSpaceName.trim() || createSpaceMutation.isPending}
                onClick={() => createSpaceMutation.mutate({ name: newSpaceName })}
              >
                Create
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialog({ open: false, file: null })}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
