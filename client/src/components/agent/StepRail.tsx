import * as React from "react";

import { cn } from "@/lib/utils";
import { ACTIVE_STEP, STEP_NAMES } from "@/lib/agentBuilder";

export interface StepRailProps {
  /** Zero-based index of the step being worked on. */
  current?: number;
}

/** The BRIEF / LOOK / BUILD / DONE rail above a screen (app.js stepsHTML). */
export function StepRail({ current = ACTIVE_STEP }: StepRailProps) {
  return (
    <nav className="steps" aria-label="Steps">
      {STEP_NAMES.map((name, i) => (
        <React.Fragment key={name}>
          {i > 0 && <span className={cn("ln", i <= current && "done")} aria-hidden="true" />}
          <span
            className={cn("st", i === current && "cur", i < current && "done")}
            aria-current={i === current ? "step" : undefined}
          >
            {i === current && <i className="sq" aria-hidden="true" />}
            {name}
          </span>
        </React.Fragment>
      ))}
    </nav>
  );
}

export default StepRail;
