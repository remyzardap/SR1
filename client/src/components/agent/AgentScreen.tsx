import * as React from "react";
import { useState } from "react";

import { FocusBrackets } from "@/components/art/FocusBrackets";
import type { AgentPlan, AgentSelection, AgentNotice, AgentDepthId, AgentOutputId, AgentSourceId } from "@/lib/agentBuilder";
import {
  BRIEF_LEDE,
  BRIEF_QUESTION,
  costLine,
  goLabel,
  showsDepth,
  summaryLine,
} from "@/lib/agentBuilder";
import { AgentGoBar } from "./AgentGoBar";
import { DepthPicker } from "./DepthPicker";
import { OutputPicker } from "./OutputPicker";
import { PlanCard } from "./PlanCard";
import { NotifyRow, SourceToggles } from "./SourceControls";
import { StepRail } from "./StepRail";

export const BRIEF_ERROR_ID = "agent-brief-error";

export interface AgentScreenProps {
  agent: AgentSelection;
  plan: AgentPlan;
  status?: "idle" | "submitting";
  notice?: AgentNotice | null;
  /** The plan changed; the rows fade and settle. */
  redrawing?: boolean;
  onSelectOutput: (id: AgentOutputId) => void;
  onBrief: (value: string) => void;
  onSelectDepth: (id: AgentDepthId) => void;
  onToggleSource: (id: AgentSourceId) => void;
  onNotify: (value: boolean) => void;
  onStart: () => void;
}

/**
 * The Agent task builder — brief, output type, depth, sources, plan, Start.
 * Presentational only: everything comes in through props, nothing is fetched here.
 */
export function AgentScreen({
  agent,
  plan,
  status = "idle",
  notice = null,
  redrawing = false,
  onSelectOutput,
  onBrief,
  onSelectDepth,
  onToggleSource,
  onNotify,
  onStart,
}: AgentScreenProps) {
  const submitting = status === "submitting";
  const invalid = notice?.kind === "validation";
  const [briefFocused, setBriefFocused] = useState(false);

  return (
    <section className="view view-enter wide">
      <div className="agent-head">
        <StepRail />
        <h1 className="title">{BRIEF_QUESTION}</h1>
        <p className="lede" style={{ marginTop: 12 }}>
          {BRIEF_LEDE}
        </p>
      </div>

      <div className="agent-grid">
        <div>
          <OutputPicker selected={agent.out} onSelect={onSelectOutput} disabled={submitting} />

          <div className="field brief">
            <label className="mono" htmlFor="agent-brief">
              Your brief
            </label>
            <textarea
              id="agent-brief"
              name="brief"
              rows={3}
              value={agent.brief}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? BRIEF_ERROR_ID : undefined}
              disabled={submitting}
              onFocus={() => setBriefFocused(true)}
              onBlur={() => setBriefFocused(false)}
              onChange={(e) => onBrief(e.target.value)}
            />
            {/* The textarea cannot carry an outline of its own (.brief textarea sets outline: 0). */}
            {(briefFocused || invalid) && <FocusBrackets className={invalid ? "show alert" : "show"} />}
          </div>

          <DepthPicker
            selected={agent.depth}
            onSelect={onSelectDepth}
            hidden={!showsDepth(agent.out)}
            disabled={submitting}
          />
          <SourceToggles srcs={agent.srcs} onToggle={onToggleSource} disabled={submitting} />
          <NotifyRow checked={agent.notify} onChange={onNotify} disabled={submitting} />
        </div>

        <aside className="agent-side">
          <PlanCard plan={plan} redrawing={redrawing} />
        </aside>
      </div>

      <AgentGoBar
        summary={summaryLine(agent)}
        cost={costLine(plan)}
        label={goLabel(agent.out)}
        onStart={onStart}
        submitting={submitting}
        notice={notice}
        noticeId={BRIEF_ERROR_ID}
      />
    </section>
  );
}

export default AgentScreen;
