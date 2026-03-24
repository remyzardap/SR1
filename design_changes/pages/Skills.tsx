import { PAGE_BG, NOISE_OVERLAY, CSS_ANIM } from '@/lib/design';
import { useState } from "react";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Trash2, Wand2, Workflow, Wrench, Brain } from "lucide-react";
import { toast } from "sonner";

const skillTypes = ["prompt", "workflow", "tool_definition", "behavior"] as const;
type SkillType = (typeof skillTypes)[number];

interface Skill {
  id: number;
  name: string;
  type: SkillType;
  description: string | null;
  content: unknown;
  identityId: number;
  createdAt: Date | string;
}

const typeConfig: Record<
  SkillType,
  { label: string; icon: typeof Wand2; bg: string; color: string; border: string }
> = {
  prompt: {
    label: "Prompt",
    icon: Wand2,
    bg: "var(--accent-dim)",
    color: "var(--accent-light)",
    border: "var(--accent-border)",
  },
  workflow: {
    label: "Workflow",
    icon: Workflow,
    bg: "var(--secondary-dim)",
    color: "var(--secondary-light)",
    border: "var(--secondary-border)",
  },
  tool_definition: {
    label: "Tool",
    icon: Wrench,
    bg: "rgba(240,160,32,0.08)",
    color: "#f0c060",
    border: "rgba(240,160,32,0.22)",
  },
  behavior: {
    label: "Behavior",
    icon: Brain,
    bg: "rgba(180,100,220,0.08)",
    color: "#c090e8",
    border: "rgba(180,100,220,0.22)",
  },
};

function formatDate(dateString: string | Date): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SkillCard({
  skill,
  onDelete,
}: {
  skill: Skill;
  onDelete: (id: number) => void;
}) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const typeInfo = typeConfig[skill.type];
  const TypeIcon = typeInfo.icon;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="group relative glass-card p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide"
                style={{
                  background: typeInfo.bg,
                  color: typeInfo.color,
                  border: `1px solid ${typeInfo.border}`,
                }}
              >
                <TypeIcon className="w-3.5 h-3.5" />
                {typeInfo.label}
              </span>
            </div>
            <h3
              className="font-semibold text-lg mb-2 truncate"
              style={{ color: "var(--foreground)" }}
            >
              {skill.name}
            </h3>
            <p
              className="text-sm line-clamp-2 mb-4"
              style={{ color: "var(--muted-foreground)" }}
            >
              {skill.description || "No description provided"}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "rgba(107,103,96,0.6)" }}>
                {formatDate(skill.createdAt)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowDeleteDialog(true)}
                className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity h-8 w-8"
                style={{ color: "var(--muted-foreground)" }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent
          className="glass-strong mx-4 sm:mx-auto"
          style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: "20px" }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "var(--foreground)" }}>
              Delete Skill
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: "var(--muted-foreground)" }}>
              Are you sure you want to delete &quot;{skill.name}&quot;? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel className="btn-liquid border-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDelete(skill.id)}
              style={{
                background: "rgba(232,68,42,0.15)",
                color: "#f5a090",
                border: "1px solid rgba(232,68,42,0.3)",
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SkillSkeleton() {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-20 h-6 glass rounded-full animate-pulse" />
      </div>
      <div className="w-3/4 h-6 glass rounded mb-2 animate-pulse" />
      <div className="w-full h-4 glass rounded mb-1 animate-pulse" />
      <div className="w-2/3 h-4 glass rounded mb-4 animate-pulse" />
      <div className="flex items-center justify-between">
        <div className="w-24 h-3 glass rounded animate-pulse" />
        <div className="w-8 h-8 glass rounded animate-pulse" />
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center py-20 px-4"
    >
      <div
        className="w-16 h-16 glass-card rounded-2xl flex items-center justify-center mb-6"
      >
        <Wand2 className="w-8 h-8" style={{ color: "var(--muted-foreground)" }} />
      </div>
      <h3
        className="text-xl font-semibold mb-2"
        style={{ color: "var(--foreground)" }}
      >
        No skills yet
      </h3>
      <p
        className="text-center max-w-md mb-6 text-sm leading-relaxed"
        style={{ color: "var(--muted-foreground)" }}
      >
        Skills are reusable prompts, workflows, tools, and behaviors that define your AI
        agent&apos;s capabilities.
      </p>
      <button onClick={onAdd} className="btn-primary-teal px-5 py-2.5 text-sm inline-flex items-center gap-2">
        <Plus className="w-4 h-4" />
        Add Skill
      </button>
    </motion.div>
  );
}

export default function Skills() {
  useSeoMeta({ title: "Skills", path: "/skills" });

  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    type: "prompt" as SkillType,
    description: "",
    content: "",
  });

  const { data: skills, isLoading } = trpc.skills.list.useQuery();
  const createMutation = trpc.skills.create.useMutation({
    onSuccess: () => {
      toast.success("Skill created successfully");
      setIsModalOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create skill");
    },
  });
  const deleteMutation = trpc.skills.delete.useMutation({
    onSuccess: () => {
      toast.success("Skill deleted successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete skill");
    },
  });

  const filteredSkills =
    skills?.filter((skill) =>
      skill.name.toLowerCase().includes(searchQuery.toLowerCase())
    ) ?? [];

  const resetForm = () => {
    setFormData({ name: "", type: "prompt", description: "", content: "" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }
    createMutation.mutate(formData);
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id });
  };

  return (
    <div className="min-h-screen bg-sutaeru">
      {/* ── Page header ── */}
      <header className="page-header">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <h1 className="text-xl sm:text-2xl font-bold" style={{ color: "var(--foreground)" }}>
            Skills
          </h1>
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn-primary-teal px-4 py-2 text-sm inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Skill</span>
          </button>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Search bar */}
        <div className="mb-6 sm:mb-8">
          <div className="relative w-full sm:max-w-md">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: "var(--muted-foreground)" }}
            />
            <Input
              type="text"
              placeholder="Search skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 input-glass"
            />
          </div>
        </div>

        {/* Skills grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkillSkeleton key={i} />
            ))}
          </div>
        ) : filteredSkills.length === 0 ? (
          searchQuery ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <p style={{ color: "var(--muted-foreground)" }}>
                No skills found matching &quot;{searchQuery}&quot;
              </p>
            </motion.div>
          ) : (
            <EmptyState onAdd={() => setIsModalOpen(true)} />
          )
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            <AnimatePresence mode="popLayout">
              {filteredSkills.map((skill) => (
                <SkillCard key={skill.id} skill={skill} onDelete={handleDelete} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </main>

      {/* ── Add Skill Modal ── */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent
          className="glass-strong w-[calc(100%-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto mx-auto"
          style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: "20px" }}
        >
          <DialogHeader>
            <DialogTitle
              className="text-xl font-semibold"
              style={{ color: "var(--foreground)" }}
            >
              Add Skill
            </DialogTitle>
            <DialogDescription style={{ color: "var(--muted-foreground)" }}>
              Create a new skill to enhance your AI agent&apos;s capabilities.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5 mt-4">
            <div className="space-y-2">
              <label
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--muted-foreground)" }}
              >
                Name
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Research Assistant"
                className="input-glass"
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--muted-foreground)" }}
              >
                Type
              </label>
              <Select
                value={formData.type}
                onValueChange={(value: SkillType) =>
                  setFormData({ ...formData, type: value })
                }
              >
                <SelectTrigger className="input-glass">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  style={{
                    background: "rgba(14,14,14,0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    backdropFilter: "blur(20px)",
                  }}
                >
                  {skillTypes.map((type) => {
                    const config = typeConfig[type];
                    const Icon = config.icon;
                    return (
                      <SelectItem key={type} value={type}>
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" style={{ color: config.color }} />
                          <span className="capitalize">{config.label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--muted-foreground)" }}
              >
                Description
              </label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of what this skill does..."
                rows={3}
                className="input-glass resize-none"
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--muted-foreground)" }}
              >
                Content
              </label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="The actual prompt, instructions, or code for this skill..."
                rows={6}
                className="input-glass font-mono text-sm"
              />
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                className="btn-liquid px-5 py-2.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="btn-primary-teal px-5 py-2.5 text-sm disabled:opacity-50"
              >
                {createMutation.isPending ? "Creating..." : "Create Skill"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
