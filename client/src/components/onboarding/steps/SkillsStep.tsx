import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wrench, Plus, Trash2, ArrowRight, ArrowLeft, SkipForward } from "lucide-react";

export interface SkillData {
  name: string;
  description: string;
  type: "prompt" | "workflow" | "tool_definition" | "behavior";
}

interface SkillsStepProps {
  initialData?: SkillData[];
  onNext: (skills: SkillData[]) => void;
  onBack: () => void;
  onSkip: () => void;
}

const SKILL_TYPE_LABELS: Record<SkillData["type"], string> = {
  prompt: "Prompt",
  workflow: "Workflow",
  tool_definition: "Tool",
  behavior: "Behavior",
};

export function SkillsStep({ initialData, onNext, onBack, onSkip }: SkillsStepProps) {
  const [skills, setSkills] = useState<SkillData[]>(initialData ?? []);
  const [isAdding, setIsAdding] = useState(false);
  const [newSkill, setNewSkill] = useState<SkillData>({
    name: "",
    description: "",
    type: "prompt",
  });
  const [addError, setAddError] = useState("");

  const addSkill = () => {
    if (!newSkill.name.trim()) {
      setAddError("Skill name is required");
      return;
    }
    if (!newSkill.description.trim()) {
      setAddError("Skill description is required");
      return;
    }
    setSkills((prev) => [...prev, { ...newSkill }]);
    setNewSkill({ name: "", description: "", type: "prompt" });
    setIsAdding(false);
    setAddError("");
  };

  const removeSkill = (index: number) => {
    setSkills((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-2">Add your skills</h2>
        <p className="text-muted-foreground">
          Skills are reusable capabilities your agent carries everywhere. You can add more later.
        </p>
      </div>

      {/* Existing skills */}
      <div className="space-y-3 mb-4">
        <AnimatePresence>
          {skills.map((skill, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="flex items-start gap-3 p-4 border border-border rounded-xl bg-card"
            >
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                <Wrench className="w-4 h-4 text-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-foreground">{skill.name}</p>
                  <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">
                    {SKILL_TYPE_LABELS[skill.type]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{skill.description}</p>
              </div>
              <button
                onClick={() => removeSkill(index)}
                className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Add skill form */}
      {isAdding ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 border border-border rounded-xl bg-card mb-4 space-y-3"
        >
          <input
            type="text"
            value={newSkill.name}
            onChange={(e) => setNewSkill((p) => ({ ...p, name: e.target.value }))}
            placeholder="Skill name (e.g. Code Reviewer)"
            className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-foreground
                       placeholder:text-muted-foreground focus:outline-none focus:border-foreground text-sm"
          />
          <select
            value={newSkill.type}
            onChange={(e) => setNewSkill((p) => ({ ...p, type: e.target.value as SkillData["type"] }))}
            className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-foreground
                       focus:outline-none focus:border-foreground text-sm cursor-pointer"
          >
            {Object.entries(SKILL_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value} className="bg-card">
                {label}
              </option>
            ))}
          </select>
          <textarea
            value={newSkill.description}
            onChange={(e) => setNewSkill((p) => ({ ...p, description: e.target.value }))}
            placeholder="Describe what this skill does..."
            rows={2}
            className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-foreground
                       placeholder:text-muted-foreground focus:outline-none focus:border-foreground text-sm resize-none"
          />
          {addError && <p className="text-sm text-destructive">{addError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => { setIsAdding(false); setAddError(""); }}
              className="px-4 py-2 border border-border rounded-lg text-foreground text-sm
                         hover:border-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={addSkill}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium
                         hover:bg-[#3a3936] transition-colors"
            >
              Add Skill
            </button>
          </div>
        </motion.div>
      ) : skills.length < 3 ? (
        <button
          onClick={() => setIsAdding(true)}
          className="w-full flex items-center justify-center gap-2 p-4 border border-dashed border-border
                     rounded-xl text-muted-foreground hover:border-foreground hover:text-foreground transition-colors mb-4"
        >
          <Plus className="w-4 h-4" />
          Add a skill {skills.length > 0 && `(${3 - skills.length} more)`}
        </button>
      ) : null}

      {/* Navigation */}
      <div className="flex flex-wrap gap-3 mt-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-6 py-3 border border-border rounded-xl text-foreground
                     hover:border-foreground hover:text-foreground transition-colors duration-200"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        {skills.length === 0 ? (
          <button
            onClick={onSkip}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 border border-border
                       rounded-xl text-foreground hover:border-foreground hover:text-foreground transition-colors"
          >
            Skip for now
            <SkipForward className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => onNext(skills)}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground
                       font-semibold rounded-xl hover:bg-[#3a3936] transition-colors duration-200"
          >
            Continue with {skills.length} skill{skills.length !== 1 ? "s" : ""}
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
}
