import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookmarkPlus, Loader2 } from "lucide-react";

type MemoryType = "preference" | "project" | "document" | "interaction" | "fact";

interface SaveMemoryDialogProps {
  open: boolean;
  content: string;
  title: string;
  type: MemoryType;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onTitleChange: (title: string) => void;
  onTypeChange: (type: MemoryType) => void;
  onSave: () => void;
}

export function SaveMemoryDialog({
  open,
  content,
  title,
  type,
  isPending,
  onOpenChange,
  onTitleChange,
  onTypeChange,
  onSave,
}: SaveMemoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md mx-4 sm:mx-auto"
        style={{
          background: "rgba(14,14,14,0.95)",
          backdropFilter: "blur(32px)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "#f0ede8",
          borderRadius: "20px",
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#f0ede8]">
            <BookmarkPlus className="h-4 w-4" />
            Save as Memory
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div
            className="rounded-xl p-3 text-sm text-[#6b6760] line-clamp-4"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            {content}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="save-title" className="text-[#c8c4be]">
              Title (optional)
            </Label>
            <Input
              id="save-title"
              placeholder="e.g. Prefers dark mode"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              className="input-glass"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="save-type" className="text-[#c8c4be]">
              Memory type
            </Label>
            <Select value={type} onValueChange={(v) => onTypeChange(v as MemoryType)}>
              <SelectTrigger id="save-type" className="input-glass">
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                style={{
                  background: "rgba(14,14,14,0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  backdropFilter: "blur(20px)",
                }}
              >
                <SelectItem value="preference">Preference</SelectItem>
                <SelectItem value="project">Project</SelectItem>
                <SelectItem value="document">Document</SelectItem>
                <SelectItem value="interaction">Interaction</SelectItem>
                <SelectItem value="fact">Fact</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="btn-liquid"
          >
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isPending} className="btn-primary-teal">
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <BookmarkPlus className="mr-2 h-4 w-4" />
            )}
            Save Memory
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
