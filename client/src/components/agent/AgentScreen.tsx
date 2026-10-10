import * as React from "react";
import { useState } from "react";

import { DocMini } from "@/components/DocMini";
import { FocusBrackets } from "@/components/art/FocusBrackets";
import { StudioFrame } from "@/components/studio/StudioFrame";
import {
  FoldAllButton,
  FoldGroup,
  FoldSection,
  GoBar,
  Showcase,
  useFoldState,
  type ShowcaseItem,
} from "@/components/fold";
import { DEFAULT_SHOT } from "@/lib/studio";
import type { AgentPlan, AgentSelection, AgentNotice, AgentDepthId, AgentOutputId, AgentSourceId } from "@/lib/agentBuilder";
import {
  BRIEF_QUESTION,
  OUTPUT_TYPES,
  SOURCE_OPTIONS,
  costLine,
  depthOf,
  goLabel,
  showsDepth,
  summaryLine,
} from "@/lib/agentBuilder";
import { DepthPicker } from "./DepthPicker";
import { PlanCard } from "./PlanCard";
import { NotifyRow, SourceToggles } from "./SourceControls";
import { pickArt } from "@/lib/pickArt";
import "./agent-create.css";

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

/** Each output keeps its own drawn art: a miniature file, or the studio frame for a picture. */
const outputArt = (id: AgentOutputId) =>
  id === "image" ? <StudioFrame shot={DEFAULT_SHOT} width={260} aspect={4 / 3} /> : <DocMini kind={id} />;

const OUTPUT_ITEMS: ShowcaseItem[] = OUTPUT_TYPES.map((o) => ({
  id: o.id,
  name: o.name,
  description: o.blurb,
  art: outputArt(o.id),
}));

/**
 * The Agent task builder: one big picture card per output type, the brief, then depth, sources
 * and the plan as folds, with the one Start button docked below.
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
  const depthShown = showsDepth(agent.out);
  const ids = depthShown ? ["depth", "sources", "plan"] : ["sources", "plan"];
  const folds = useFoldState("agent", ids, { first: depthShown ? "depth" : "sources" });
  const depth = depthOf(agent.depth);
  const srcNames = SOURCE_OPTIONS.filter((s) => agent.srcs[s.id]).map((s) => s.short);
  const n = depthShown ? 1 : 0;

  return (
    <section className="view view-enter wide agent-create">
      <div className="agent-head">
        <div className="head-row head-top">
          <h1 className="title">{BRIEF_QUESTION}</h1>
          <FoldAllButton state={folds} />
        </div>
      </div>

      <fieldset className="agent-out" disabled={submitting}>
        <legend className="sr-only">What to make</legend>
        <Showcase items={OUTPUT_ITEMS} value={agent.out} onChange={(id) => onSelectOutput(id as AgentOutputId)} label="What to make" />
      </fieldset>

      <div className="pfield agent-brief">
        <textarea
          id="agent-brief"
          name="brief"
          rows={3}
          value={agent.brief}
          placeholder="Describe what to make"
          aria-label="Your brief"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? BRIEF_ERROR_ID : undefined}
          disabled={submitting}
          onFocus={() => setBriefFocused(true)}
          onBlur={() => setBriefFocused(false)}
          onChange={(e) => onBrief(e.target.value)}
        />
        {/* The textarea draws no outline of its own; the brackets show focus, or the alert. */}
        {(briefFocused || invalid) && <FocusBrackets tone={invalid ? "alert" : "ink"} className="show" />}
      </div>
      {notice && (
        <p id={BRIEF_ERROR_ID} className="mono agent-notice" role="alert">
          {notice.message}
        </p>
      )}

      <FoldGroup state={folds} className="agent-folds">
        {depthShown && (
          <FoldSection id="depth" index={1} label="How deep" pick={depth.label} mini={pickArt(`depth-${agent.depth}`)}>
            <DepthPicker selected={agent.depth} onSelect={onSelectDepth} disabled={submitting} />
          </FoldSection>
        )}
        <FoldSection id="sources" index={n + 1} label="Sources" pick={srcNames.length ? srcNames.join(", ") : "None"}>
          <SourceToggles srcs={agent.srcs} onToggle={onToggleSource} disabled={submitting} />
          <NotifyRow checked={agent.notify} onChange={onNotify} disabled={submitting} />
        </FoldSection>
        <FoldSection id="plan" index={n + 2} label="Sutaeru will" pick={`${plan.total} · ${plan.credits} cr`}>
          <PlanCard plan={plan} redrawing={redrawing} />
        </FoldSection>
      </FoldGroup>

      <GoBar
        summary={summaryLine(agent)}
        detail={costLine(plan)}
        actionLabel={submitting ? "Starting" : goLabel(agent.out)}
        onAction={onStart}
        disabled={submitting}
      />
    </section>
  );
}

export default AgentScreen;
