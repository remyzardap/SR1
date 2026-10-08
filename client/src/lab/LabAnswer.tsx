import * as React from "react";
import { Link, useSearch } from "wouter";
import { AppHeader } from "@/components/chrome/AppHeader";
import { AnswerScreen, type AnswerScreenState } from "@/components/answer/AnswerScreen";
import { ThinkingBlock } from "@/components/chat/ThinkingBlock";
import { ApprovalCard } from "@/components/chat/ApprovalCard";
import { ActivityFeed } from "@/components/ActivityFeed";
import { useLabSettings } from "./LabLayout";
import {
  ANSWER_APPROVAL, ANSWER_CHART, ANSWER_FACTS, ANSWER_QUESTION, ANSWER_RELATED, ANSWER_SEGMENTS,
  ANSWER_SOURCES, ANSWER_STEPS, ANSWER_TAIL, ANSWER_THINKING,
} from "./fixtures/answer";

const STATES: AnswerScreenState[] = ["searching", "streaming", "done", "error", "cancelled", "approval", "offline"];

/** /__lab/answer?state=<name>&theme=light|dark. No login, no network. */
export default function LabAnswer() {
  useLabSettings();
  const params = new URLSearchParams(useSearch());
  const wanted = params.get("state") as AnswerScreenState | null;
  const state: AnswerScreenState = wanted && STATES.includes(wanted) ? wanted : "done";
  const query = (s: string) => {
    const p = new URLSearchParams(params);
    p.set("state", s);
    return `?${p.toString()}`;
  };
  const partial = state === "cancelled" ? ANSWER_SEGMENTS.slice(0, 2) : ANSWER_SEGMENTS;
  const extra =
    state === "approval" ? <ApprovalCard approval={ANSWER_APPROVAL} onDecision={() => undefined} /> :
    state === "streaming" ? (
      <>
        <ActivityFeed items={ANSWER_STEPS} isRunning />
        <ThinkingBlock thinking={ANSWER_THINKING} />
      </>
    ) :
    state === "done" ? <ThinkingBlock thinking={ANSWER_THINKING} /> : null;

  return (
    <div className="lab-answer">
      <nav className="lab-states mono" aria-label="Lab states" style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "8px 12px", borderBottom: "1px solid var(--hair)" }}>
        <Link href="/__lab">Lab</Link>
        {STATES.map((s) => (
          <Link key={s} href={query(s)} style={{ fontWeight: s === state ? 700 : 400, color: s === state ? "var(--ink)" : "var(--quiet)" }}>{s}</Link>
        ))}
      </nav>
      <AppHeader mode="chat" userInitial="R" statusText="Sutaeru · ready" />
      <main>
        <AnswerScreen
          key={state}
          state={state}
          question={ANSWER_QUESTION}
          sources={ANSWER_SOURCES}
          segments={partial}
          tail={state === "cancelled" ? undefined : ANSWER_TAIL}
          chart={state === "cancelled" ? undefined : { title: "Payback by system size", data: ANSWER_CHART, highlight: 3 }}
          facts={ANSWER_FACTS}
          related={ANSWER_RELATED}
          summary="Searched 14 sources · 6 s"
          extra={extra}
          animate={params.get("animate") !== "0"}
        />
      </main>
    </div>
  );
}
