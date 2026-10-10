/**
 * Skills — the container, on the shared list pattern (no shadcn).
 *
 * One fold per kind of skill, the built-in panel folded under them, and the form that
 * teaches Sutaeru something new in a sheet: a picture tile per skill type, native fields,
 * nothing from components/ui. Deleting is a second press on the same button, the way
 * Memories does it, so there is no dialog in the way.
 */
import type React from "react";
import { useState } from "react";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { SutaeruIcon, type SutaeruIconName } from "@/components/SutaeruIcon";
import { Sheet } from "@/components/art";
import { toast } from "sonner";
import { AgentSkillsPanel } from "@/components/AgentSkillsPanel";
import { ListEmpty, ListFold, ListFolds, ListPage, NoResults, Row, Rows, RowsSkeleton, SearchBar, useListFolds } from "@/components/list";
import { PickTiles, type PickItem } from "@/components/fold";
import { pickArt } from "@/lib/pickArt";
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

const typeConfig: Record<SkillType, { label: string; icon: SutaeruIconName; text: string; art: string }> = {
  prompt: { label: "Prompt", icon: "make", text: "A standing instruction Sutaeru follows.", art: pickArt("document") },
  workflow: { label: "Workflow", icon: "plan", text: "A run of steps, done in order.", art: pickArt("nav-agent") },
  tool_definition: { label: "Tool", icon: "settings", text: "Something Sutaeru can call and read back.", art: pickArt("code") },
  behavior: { label: "Behavior", icon: "agent", text: "How Sutaeru should act on every answer.", art: pickArt("nav-chat") },
};

const TYPE_ITEMS: PickItem[] = skillTypes.map((type) => ({
  id: type,
  label: typeConfig[type].label,
  art: typeConfig[type].art,
}));

const FOLD_IDS = ["prompt", "workflow", "tool", "behavior", "teach"];
const FOLD_OF: Record<SkillType, string> = {
  prompt: "prompt",
  workflow: "workflow",
  tool_definition: "tool",
  behavior: "behavior",
};

/** A skill row: the kind's tile, the name, what it does, how often it has been used. */
function SkillRow({ skill, onDelete }: { skill: Skill; onDelete: (id: number) => void }) {
  const [confirming, setConfirming] = useState(false);
  const typeInfo = typeConfig[skill.type];
  const uses = skill.usageCount ?? 0;

  function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 2500);
      return;
    }
    onDelete(skill.id);
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="lst-row"
    >
      <span className="lst-art round" aria-hidden="true">
        <SutaeruIcon name={typeInfo.icon} signal={false} />
      </span>
      <div className="lst-main">
        <p className="lst-name">{skill.name}</p>
        <p className="lst-body clamp">{skill.description || "No description provided"}</p>
        <p className="mono lst-meta">
          {uses} use{uses === 1 ? "" : "s"}
        </p>
      </div>
      <div className="lst-side">
        <button
          type="button"
          onClick={handleDelete}
          aria-label={confirming ? `Confirm delete ${skill.name}` : `Delete ${skill.name}`}
          title={confirming ? "Click again to confirm" : "Delete skill"}
          className="lp-icon-btn"
          style={confirming ? { background: "var(--r-accent-tint)", color: "var(--r-accent)" } : undefined}
        >
          <SutaeruIcon name="delete" width={16} height={16} />
        </button>
      </div>
    </motion.li>
  );
}

function SkillSkeleton() {
  return (
    <li className="lst-row">
      <span className="lst-art round" aria-hidden="true">
        <span className="lst-skeleton" style={{ width: "100%", height: "100%", borderRadius: 999 }} />
      </span>
      <div className="lst-main">
        <span className="lst-skeleton" style={{ height: 18, width: "58%" }} />
        <span className="lst-skeleton" style={{ height: 12, width: "82%" }} />
      </div>
    </li>
  );
}

/* ── The add-skill sheet (presentational: every value and handler comes from the page) ── */

export interface SkillDraft {
  name: string;
  type: SkillType;
  description: string;
  content: string;
}

export function SkillSheet({
  open,
  draft,
  busy,
  onChange,
  onSubmit,
  onClose,
}: {
  open: boolean;
  draft: SkillDraft;
  busy: boolean;
  onChange(next: SkillDraft): void;
  onSubmit(): void;
  onClose(): void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Add Skill">
      <form
        className="lst-form sheet-form"
        onSubmit={(event: React.FormEvent) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <p className="lede" style={{ fontSize: 15 }}>
          Teach Sutaeru something it can do again.
        </p>

        <div className="lst-field">
          <label className="mono" htmlFor="skill-name">
            Name
          </label>
          <input
            id="skill-name"
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="e.g., Research Assistant"
            className="lst-input"
          />
        </div>

        <div className="lst-field">
          <span className="mono">Type</span>
          <PickTiles label="Skill type" items={TYPE_ITEMS} value={draft.type} onChange={(id) => onChange({ ...draft, type: id as SkillType })} />
          <p className="lst-note">{typeConfig[draft.type].text}</p>
        </div>

        <div className="lst-field">
          <label className="mono" htmlFor="skill-description">
            Description
          </label>
          <textarea
            id="skill-description"
            value={draft.description}
            onChange={(e) => onChange({ ...draft, description: e.target.value })}
            placeholder="Brief description of what this skill does..."
            rows={3}
            className="lst-area"
          />
        </div>

        <div className="lst-field">
          <label className="mono" htmlFor="skill-content">
            Content
          </label>
          <textarea
            id="skill-content"
            value={draft.content}
            onChange={(e) => onChange({ ...draft, content: e.target.value })}
            placeholder="The actual prompt, instructions, or code for this skill..."
            rows={6}
            className="lst-area"
            style={{ fontFamily: "var(--r-font-mono)", fontSize: 13 }}
          />
        </div>

        <div className="lst-form-foot">
          <button type="button" onClick={onClose} className="btn ghost">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="btn">
            {busy ? "Creating..." : "Create Skill"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export default function Skills() {
  useSeoMeta({ title: "Skills", path: "/skills" });

  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [formData, setFormData] = useState<SkillDraft>({
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

  const filteredSkills = skills?.filter((skill) => skill.name.toLowerCase().includes(searchQuery.toLowerCase())) ?? [];

  const resetForm = () => {
    setFormData({ name: "", type: "prompt", description: "", content: "" });
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }
    createMutation.mutate(formData);
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id });
  };

  const groups = skillTypes
    .map((type) => ({ type, rows: filteredSkills.filter((skill) => skill.type === type) }))
    .filter((group) => group.rows.length > 0);

  const fold = useListFolds("skills", FOLD_IDS, { first: "prompt" });

  return (
    <>
      <ListPage
        title="Skills"
        lede="Reusable abilities Sutaeru can call. Turn them on, or teach it new ones."
        fold={fold}
        actions={
          <button type="button" onClick={() => setIsModalOpen(true)} className="btn">
            <SutaeruIcon name="plus" className="ico" /> Add Skill
          </button>
        }
      >
        <SearchBar value={searchQuery} onChange={setSearchQuery} label="Search skills" placeholder="Search skills…" count={isLoading ? undefined : `${filteredSkills.length}`} />

        <div className="lp-section" style={{ marginTop: 4 }}>
          <AgentSkillsPanel />
        </div>

        {isLoading ? (
          <Rows label="Loading skills">
            <SkillSkeleton />
            <SkillSkeleton />
            <SkillSkeleton />
          </Rows>
        ) : (
          <ListFolds fold={fold}>
            {searchQuery && filteredSkills.length === 0 ? null : groups.map((group, i) => (
              <ListFold
                key={group.type}
                id={FOLD_OF[group.type]}
                index={i + 1}
                fold={fold}
                label={typeConfig[group.type].label}
                pick={`${group.rows.length} ${group.rows.length === 1 ? "skill" : "skills"}`}
                mini={typeConfig[group.type].art}
              >
                <Rows label={typeConfig[group.type].label}>
                  {group.rows.map((skill) => (
                    <SkillRow key={skill.id} skill={skill} onDelete={handleDelete} />
                  ))}
                </Rows>
              </ListFold>
            ))}

            {searchQuery && filteredSkills.length === 0 ? (
              <NoResults query={searchQuery} onClear={() => setSearchQuery("")} />
            ) : filteredSkills.length === 0 ? (
              <ListEmpty
                title="No skills yet."
                text="Skills are reusable prompts, workflows, tools, and behaviors that define what Sutaeru can do."
                icon="make"
              />
            ) : null}

            <ListFold
              id="teach"
              index={groups.length + 1}
              fold={fold}
              label="Teach a new skill"
              pick="one form"
              mini={typeConfig.prompt.art}
            >
              <Rows label="Teach a new skill">
                <Row
                  title="Teach Sutaeru a new skill"
                  body="Describe a routine once. Sutaeru turns it into a skill you can reuse."
                  meta="PROMPT · WORKFLOW · TOOL · BEHAVIOR"
                  icon="plus"
                  actions={
                    <button type="button" className="btn" onClick={() => setIsModalOpen(true)}>
                      Add Skill
                    </button>
                  }
                />
              </Rows>
            </ListFold>
          </ListFolds>
        )}
      </ListPage>

      <SkillSheet
        open={isModalOpen}
        draft={formData}
        busy={createMutation.isPending}
        onChange={setFormData}
        onSubmit={handleSubmit}
        onClose={() => {
          setIsModalOpen(false);
          resetForm();
        }}
      />
    </>
  );
}
