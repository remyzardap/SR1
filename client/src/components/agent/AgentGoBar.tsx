import * as React from "react";

import { SutaeruIcon } from "@/components/SutaeruIcon";
import type { AgentNotice } from "@/lib/agentBuilder";

export interface AgentGoBarProps {
  /** "Report · Standard · Web, My files" */
  summary: string;
  /** "About 8 min · 4 credits" */
  cost: string;
  label: string;
  onStart: () => void;
  submitting?: boolean;
  notice?: AgentNotice | null;
  /** Element id the brief textarea points at with aria-describedby. */
  noticeId?: string;
}

/** Sticky footer: what you asked for, what it costs, and the button that starts it. */
export function AgentGoBar({
  summary,
  cost,
  label,
  onStart,
  submitting = false,
  notice = null,
  noticeId,
}: AgentGoBarProps) {
  return (
    <div className="go-bar">
      <div className="sum">
        <span className="mono">{summary}</span>
        <b className="tnum">{cost}</b>
        {notice && (
          <span id={noticeId} className="mono" role="alert" style={{ display: "block", color: "var(--alert)" }}>
            {notice.message}
          </span>
        )}
      </div>
      <button type="button" className="btn ink big" onClick={onStart} disabled={submitting} aria-busy={submitting || undefined}>
        {submitting && <span className="live-dot pulse" />}
        {label}
        <SutaeruIcon name="arrow" signal={false} className="ico" />
      </button>
    </div>
  );
}

export default AgentGoBar;
