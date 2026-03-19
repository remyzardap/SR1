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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import type { FileRecord } from "../../../drizzle/schema";

const FORMAT_ICON: Record<string, React.ElementType> = {
  pdf: FileText,
  docx: FileText,
  xlsx: Table,
  pptx: Presentation,
  md: FileCode,
};

const FORMAT_COLOR: Record<string, string> = {
  pdf: "bg-red-100 text-red-700",
  docx: "bg-blue-100 text-blue-700",
  xlsx: "bg-green-100 text-green-700",
  pptx: "bg-orange-100 text-orange-700",
  md: "bg-purple-100 text-purple-700",
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
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; file: FileRecord | null }>({
    open: false,
    file: null,
  });
  const [newName, setNewName] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; file: FileRecord | null }>({
    open: false,
    file: null,
  });

  const utils = trpc.useUtils();

  const { data: files = [], isLoading } = trpc.files.list.useQuery();

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

  const filtered = files.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.originalPrompt.toLowerCase().includes(search.toLowerCase())
  );

  const openRename = (file: FileRecord) => {
    setNewName(file.name);
    setRenameDialog({ open: true, file });
  };

  const openDelete = (file: FileRecord) => {
    setDeleteDialog({ open: true, file });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-700 text-foreground">File Manager</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {files.length} file{files.length !== 1 ? "s" : ""} generated
          </p>
        </div>
        <Button onClick={() => navigate("/generate")}>
          <Plus className="mr-2 h-4 w-4" />
          New File
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search files by name or prompt..."
          className="pl-9"
        />
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
            <FolderOpen className="h-8 w-8" />
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
              <Plus className="mr-2 h-4 w-4" />
              Generate a File
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((file) => {
            const Icon = FORMAT_ICON[file.format] ?? FileText;
            const colorClass = FORMAT_COLOR[file.format] ?? "bg-gray-100 text-gray-700";
            return (
              <div
                key={file.id}
                className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-accent/30"
              >
                {/* Icon */}
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold", colorClass)}>
                  <Icon className="h-5 w-5" />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
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
                <div className="flex shrink-0 items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button asChild size="sm" variant="ghost">
                    <a href={file.fileUrl} target="_blank" rel="noopener noreferrer" download>
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openRename(file)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => openDelete(file)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
    </div>
  );
}
