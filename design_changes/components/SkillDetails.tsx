import { CheckCircle, AlertCircle, Code } from "lucide-react";
import type { Skill } from "./SkillPreviewModal";

interface SkillDetailsProps {
  skill: Skill;
}

export function SkillDetails({ skill }: SkillDetailsProps) {
  return (
    <div className="space-y-5 text-sm">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">
          Description
        </h3>
        <p className="text-white/80 leading-relaxed">{skill.description}</p>
      </section>

      {(skill.sampleInput || skill.sampleOutput) && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1">
            <Code size={12} /> Sample Usage
          </h3>
          <div className="space-y-2">
            {skill.sampleInput && (
              <div>
                <span className="text-xs text-white/40 block mb-1">Input</span>
                <div
                  className="p-3 rounded-lg text-white/80 font-mono text-xs whitespace-pre-wrap"
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {skill.sampleInput}
                </div>
              </div>
            )}
            {skill.sampleOutput && (
              <div>
                <span className="text-xs text-white/40 block mb-1">Output</span>
                <div
                  className="p-3 rounded-lg text-white/80 font-mono text-xs whitespace-pre-wrap"
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {skill.sampleOutput}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {skill.dependencies.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">
            Dependencies
          </h3>
          <ul className="space-y-1">
            {skill.dependencies.map((dep) => (
              <li key={dep} className="flex items-center gap-2 text-white/70">
                <CheckCircle size={13} className="text-blue-400 shrink-0" />
                {dep}
              </li>
            ))}
          </ul>
        </section>
      )}

      {skill.requirements.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">
            Requirements
          </h3>
          <ul className="space-y-1">
            {skill.requirements.map((req) => (
              <li key={req} className="flex items-center gap-2 text-white/70">
                <AlertCircle size={13} className="text-amber-400 shrink-0" />
                {req}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="pt-2 border-t border-white/10 text-white/40 text-xs space-y-1">
        <div>Created: {new Date(skill.createdAt).toLocaleDateString()}</div>
        <div>Updated: {new Date(skill.updatedAt).toLocaleDateString()}</div>
      </section>
    </div>
  );
}
