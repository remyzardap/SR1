import type React from "react";
import { useState } from "react";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { FocusBrackets } from "@/components/art";
import { PageTitle } from "@/components/chrome/PageTitle";
import "@/styles/list-pages.css";

const skillTypes = ["prompt", "workflow", "tool_definition", "behavior"] as const;
type SkillType = (typeof skillTypes)[number];

interface Skill {
  id: number;
  name: string;
  type: SkillType;
  description: string | null;
  content: unknown;
  identityId: number;
  usageCount?: number;
  createdAt: Date | string;
}

const typeConfig: Record<
  SkillType,
  { label: string; icon: SutaeruIconName; text: string }
> = {
  prompt: {
    label: "Prompt",
    icon: "make",
    text: "A standing instruction Kemma follows.",
  },
  workflow: {
    label: "Workflow",
    icon: "plan",
    text: "A run of steps, done in order.",
  },
  tool_definition: {
    label: "Tool",
    icon: "settings",
    text: "Something Kemma can call and read back.",
  },
  behavior: {
    label: "Behavior",
    icon: "agent",
    text: "How Kemma should act on every answer.",
  },
};

function SkillCard({
  skill,
  onDelete,
}: {
  skill: Skill;
  onDelete: (id: number) => void;
}) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const typeInfo = typeConfig[skill.type];
  const uses = skill.usageCount ?? 0;

  return (
    <>
      <motion.li
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        className="lp-row group"
      >
        {/* The row waiting for a delete decision is the active one. */}
        {showDeleteDialog && <FocusBrackets />}
        <span className="lp-tile" aria-hidden="true">
          <SutaeruIcon name={typeInfo.icon} />
        </span>
        <div className="lp-row-main">
          <p className="lp-row-title truncate">{skill.name}</p>
          {/* One line, like the canvas: the description, then the type and its use count. */}
          <p className="lp-body lp-one-line">
            {skill.description || "No description provided"}
          </p>
          <span className="lp-mono">
            {typeInfo.label} · {uses} use{uses === 1 ? "" : "s"}
          </span>
        </div>
        <div className="lp-row-side">
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            aria-label={`Delete ${skill.name}`}
            className="lp-icon-btn opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
          >
            <SutaeruIcon name="delete" />
          </button>
        </div>
      </motion.li>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="sk-dialog lp-dialog w-[calc(100%-2rem)] sm:mx-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete Skill
            </AlertDialogTitle>
            <AlertDialogDescription className="lp-body">
              Are you sure you want to delete &quot;{skill.name}&quot;? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel className="lp-btn lp-btn-quiet border-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDelete(skill.id)}
              className="lp-btn"
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
    <li className="lp-row">
      <span className="lp-skeleton lp-tile" style={{ width: 56, height: 56, borderRadius: "var(--r-radius-thumb)" }} />
      <div className="lp-row-main">
        <span className="lp-skeleton" style={{ height: 20, width: "58%" }} />
        <span className="lp-skeleton" style={{ height: 14, width: "82%" }} />
        <span className="lp-skeleton" style={{ height: 11, width: "30%" }} />
      </div>
    </li>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="lp-empty"
    >
      <FocusBrackets />
      <span className="lp-empty-mark"><SutaeruIcon name="make" width={44} height={44} /></span>
      <h2 className="lp-empty-title">No skills yet.</h2>
      <p className="lp-empty-text">
        Skills are reusable prompts, workflows, tools, and behaviors that define what
        Sutaeru can do.
      </p>
      <button type="button" onClick={onAdd} className="lp-btn">
        Add Skill
      </button>
    </motion.section>
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
    <div className="lp-page min-h-screen">
      {/* ── Page header ── */}
      <header className="lp-head">
        <div className="lp-head-main">
          <PageTitle className="lp-title">Skills</PageTitle>
          <p className="lp-lede">
            Reusable abilities Sutaeru can call. Turn them on, or teach it new ones.
          </p>
        </div>
        <div className="lp-actions">
          <button type="button" onClick={() => setIsModalOpen(true)} className="lp-btn lp-btn-quiet lp-btn-sm">
            <SutaeruIcon name="plus" /> Add Skill
          </button>
        </div>
      </header>

      <AgentSkillsPanel />

      {/* Search bar */}
      <div className="lp-section" style={{ marginTop: 0, marginBottom: 20 }}>
        <div className="lp-search">
          <SutaeruIcon name="search" />
          <input
            type="text"
            placeholder="Search skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Skills list */}
      {isLoading ? (
        <ul className="lp-rows" aria-label="Loading skills">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkillSkeleton key={i} />
          ))}
        </ul>
      ) : filteredSkills.length === 0 ? (
        searchQuery ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="lp-empty"
          >
            <span className="lp-mono">Skills</span>
            <p className="lp-empty-text">
              No skills found matching &quot;{searchQuery}&quot;
            </p>
          </motion.div>
        ) : (
          <EmptyState onAdd={() => setIsModalOpen(true)} />
        )
      ) : (
        <motion.ul layout className="lp-rows">
          <AnimatePresence mode="popLayout">
            {filteredSkills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} onDelete={handleDelete} />
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      {/* Teach a new skill */}
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="lp-row"
      >
        <span className="lp-tile" aria-hidden="true">
          <SutaeruIcon name="plus" />
        </span>
        <span className="lp-row-main">
          <span className="lp-row-title">
            Teach Sutaeru a new skill
          </span>
          <span className="lp-body">
            Describe a routine once. Sutaeru turns it into a skill you can reuse.
          </span>
        </span>
      </button>

      {/* ── Add Skill Modal ── */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sk-dialog lp-dialog w-[calc(100%-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto mx-auto">
          <DialogHeader>
            <DialogTitle>
              Add Skill
            </DialogTitle>
            <DialogDescription className="lp-body">
              Create a new skill to enhance your AI agent&apos;s capabilities.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5 mt-4">
            <div className="lp-field-group">
              <label className="lp-mono" htmlFor="skill-name">
                Name
              </label>
              <input
                id="skill-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Research Assistant"
                className="lp-field"
                style={{ marginTop: 8 }}
              />
            </div>

            <div className="lp-field-group">
              <span className="lp-mono">Type</span>
              {/* The choice is shown as cards, one per skill type. */}
              <div className="lp-choice-grid" role="radiogroup" aria-label="Skill type">
                {skillTypes.map((type) => {
                  const config = typeConfig[type];
                  const active = formData.type === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`lp-choice${active ? " is-active" : ""}`}
                      onClick={() => setFormData({ ...formData, type })}
                    >
                      <span className="lp-choice-icon" aria-hidden="true">
                        <SutaeruIcon name={config.icon} />
                      </span>
                      <span className="lp-choice-label">{config.label}</span>
                      <span className="lp-choice-text">{config.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="lp-field-group">
              <label className="lp-mono" htmlFor="skill-description">
                Description
              </label>
              <Textarea
                id="skill-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of what this skill does..."
                rows={3}
                className="lp-field lp-area"
                style={{ marginTop: 8 }}
              />
            </div>

            <div className="lp-field-group">
              <label className="lp-mono" htmlFor="skill-content">
                Content
              </label>
              <Textarea
                id="skill-content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="The actual prompt, instructions, or code for this skill..."
                rows={6}
                className="lp-field lp-area"
                style={{ marginTop: 8, fontFamily: "var(--r-font-mono)", fontSize: 13 }}
              />
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                className="lp-btn lp-btn-quiet"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="lp-btn"
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
