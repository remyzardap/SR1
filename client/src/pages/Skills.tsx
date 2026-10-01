import type React from "react";
import { useState } from "react";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
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
import { SutaeruIcon, type SutaeruIconName } from "@/components/SutaeruIcon";
import { toast } from "sonner";
import { AgentSkillsPanel } from "@/components/AgentSkillsPanel";

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
  { label: string; icon: SutaeruIconName }
> = {
  prompt: {
    label: "Prompt",
    icon: "make",
  },
  workflow: {
    label: "Workflow",
    icon: "plan",
  },
  tool_definition: {
    label: "Tool",
    icon: "settings",
  },
  behavior: {
    label: "Behavior",
    icon: "agent",
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

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="sk-card group relative flex flex-col gap-3"
      >
        <div className="sk-between">
          <span className="sk-icon-tile">
            <SutaeruIcon name={typeInfo.icon} />
          </span>
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            aria-label={`Delete ${skill.name}`}
            className="sk-icon-btn opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
          >
            <SutaeruIcon name="delete" />
          </button>
        </div>
        <h3 className="sk-tile-title truncate">{skill.name}</h3>
        <p className="sk-empty-text line-clamp-2">
          {skill.description || "No description provided"}
        </p>
        <div className="sk-meta mt-auto pt-2">
          {typeInfo.label} &middot; {formatDate(skill.createdAt)}
        </div>
      </motion.div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="sk-dialog w-[calc(100%-2rem)] sm:mx-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete Skill
            </AlertDialogTitle>
            <AlertDialogDescription className="sk-muted">
              Are you sure you want to delete &quot;{skill.name}&quot;? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel className="sk-btn sk-btn-ghost border-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDelete(skill.id)}
              className="sk-btn"
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
    <div className="sk-card flex flex-col gap-3">
      <div className="sk-between">
        <div className="sk-skeleton h-14 w-14" />
        <div className="sk-skeleton h-7 w-12" />
      </div>
      <div className="sk-skeleton h-5 w-3/4" />
      <div className="sk-skeleton h-4 w-full" />
      <div className="sk-skeleton h-4 w-2/3" />
      <div className="sk-skeleton h-3 w-24 mt-2" />
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="sk-card sk-empty"
    >
      <span className="sk-icon-tile">
        <SutaeruIcon name="make" />
      </span>
      <span className="sk-label">Skills</span>
      <h3 className="m-0 font-semibold text-xl">
        No skills yet
      </h3>
      <p className="sk-empty-text max-w-md">
        Skills are reusable prompts, workflows, tools, and behaviors that define your AI
        agent&apos;s capabilities.
      </p>
      <button type="button" onClick={onAdd} className="sk-btn mt-2 self-start">
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
    <div className="sk-page min-h-screen">
      {/* ── Page header ── */}
      <header className="sk-header">
        <div>
          <h1 className="sk-h1">Skills</h1>
          <p className="sk-sub">
            Reusable abilities Sutaeru can call. Turn them on, or teach it new ones.
          </p>
        </div>
        <div className="sk-actions">
          <button type="button" onClick={() => setIsModalOpen(true)} className="sk-btn">
            Add Skill
          </button>
        </div>
      </header>

      <AgentSkillsPanel />

      {/* Search bar */}
      <div className="sk-toolbar">
        <div className="sk-search">
          <SutaeruIcon name="search" />
          <Input
            type="text"
            placeholder="Search skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Skills grid */}
      {isLoading ? (
        <div className="sk-grid-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkillSkeleton key={i} />
          ))}
        </div>
      ) : filteredSkills.length === 0 ? (
        searchQuery ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="sk-card sk-empty"
          >
            <span className="sk-label">Skills</span>
            <p className="sk-empty-text">
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
          className="sk-grid-3"
        >
          <AnimatePresence mode="popLayout">
            {filteredSkills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} onDelete={handleDelete} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Teach a new skill */}
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="sk-card sk-row w-full mt-7 text-left hover:bg-[#FBFAF7] transition-colors"
      >
        <span className="sk-icon-tile">
          <SutaeruIcon name="plus" />
        </span>
        <span className="sk-col">
          <span className="font-semibold text-[19px] leading-tight">
            Teach Sutaeru a new skill
          </span>
          <span className="sk-empty-text">
            Describe a routine once. Sutaeru turns it into a skill you can reuse.
          </span>
        </span>
      </button>

      {/* ── Add Skill Modal ── */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sk-dialog w-[calc(100%-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto mx-auto">
          <DialogHeader>
            <DialogTitle>
              Add Skill
            </DialogTitle>
            <DialogDescription className="sk-muted">
              Create a new skill to enhance your AI agent&apos;s capabilities.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5 mt-4">
            <div className="sk-field">
              <label className="sk-label">
                Name
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Research Assistant"
                className="sk-input"
              />
            </div>

            <div className="sk-field">
              <label className="sk-label">
                Type
              </label>
              <Select
                value={formData.type}
                onValueChange={(value: SkillType) =>
                  setFormData({ ...formData, type: value })
                }
              >
                <SelectTrigger className="sk-select h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  style={{
                    background: "#fff",
                    border: "1px solid #EFEEE8",
                    borderRadius: 20,
                  }}
                >
                  {skillTypes.map((type) => {
                    const config = typeConfig[type];
                    return (
                      <SelectItem key={type} value={type}>
                        <div className="flex items-center gap-2">
                          <SutaeruIcon name={config.icon} className="h-4 w-4" />
                          <span className="capitalize">{config.label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="sk-field">
              <label className="sk-label">
                Description
              </label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of what this skill does..."
                rows={3}
                className="sk-textarea resize-none"
              />
            </div>

            <div className="sk-field">
              <label className="sk-label">
                Content
              </label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="The actual prompt, instructions, or code for this skill..."
                rows={6}
                className="sk-textarea font-mono text-sm"
              />
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                className="sk-btn sk-btn-ghost"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="sk-btn"
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
