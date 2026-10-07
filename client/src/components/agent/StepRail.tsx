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
    <div className="steps" aria-label={`Step ${current + 1} of ${STEP_NAMES.length}`}>
      {STEP_NAMES.map((name, i) => (
        <React.Fragment key={name}>
          {i > 0 && <span className={cn("ln", i <= current && "done")} />}
          <span className={cn("st", i === current && "cur", i < current && "done")}>
            <span className="mono">
              <span className="num">{`0${i + 1} `}</span>
              {name}
            </span>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

export default StepRail;
