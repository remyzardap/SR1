import * as React from "react";

import { cn } from "@/lib/utils";
import type { AgentPlan } from "@/lib/agentBuilder";

export interface PlanCardProps {
  plan: AgentPlan;
  /** True while the plan is being reworked after a change; the rows fade, then settle. */
  redrawing?: boolean;
  className?: string;
}

/** "Sutaeru will" — the plan the current choices add up to. */
export function PlanCard({ plan, redrawing = false, className }: PlanCardProps) {
  return (
    <div className={cn("card plan-card", className)} aria-busy={redrawing || undefined}>
      <p className="mono">Sutaeru will</p>
      <div className="plan-flow" style={{ opacity: redrawing ? 0.4 : 1, transition: "opacity 240ms var(--ease)" }}>
        {plan.rows.map((row, i) => (
          <div className="pf" key={`${row.name}-${i}`}>
            <span className="nd" />
            <span>
              <b>{row.name}</b>
              <small>{row.sub}</small>
            </span>
            <span className="mono tnum">{row.time}</span>
          </div>
        ))}
      </div>
      <div className="plan-total">
        <div className="tx">
          <span className="mono">Total</span>
          <b className="tnum" style={{ display: "block", marginTop: 6 }}>
            {plan.total}
          </b>
        </div>
        <div style={{ textAlign: "right" }}>
          <span className="mono">Cost</span>
          <b className="tnum" style={{ display: "block", marginTop: 6 }}>
            {plan.credits} cr
          </b>
        </div>
      </div>
    </div>
  );
}

export default PlanCard;
