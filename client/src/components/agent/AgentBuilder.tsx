import * as React from "react";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import { useReducedMotion } from "@/components/art/useMotion";
import { usePersistFn } from "@/hooks/usePersistFn";
import {
  AGENT_DEFAULTS,
  agentReducer,
  briefNotice,
  initialAgentState,
  loadSelection,
  planFor,
  requestText,
  saveSelection,
  type AgentSelection,
} from "@/lib/agentBuilder";
import { AgentScreen } from "./AgentScreen";

export interface AgentBuilderProps {
  /** The chat's own send path: a task is created exactly like a sent message. */
  onCreateTask: (text: string) => void | Promise<void>;
  /** A picture goes to the photo studio instead of starting a run (app.js startAgent). */
  onOpenStudio: () => void;
  /** Once the run exists, the thread is the session view. */
  onOpenSession: () => void;
  isStreaming: boolean;
  error: string | null;
  /** Seeds the builder; otherwise the saved draft is restored. */
  selection?: AgentSelection;
}

/**
 * The container for the task builder. It owns the draft, talks to the real send path,
 * and keeps the draft in sessionStorage so a trip to the studio does not lose the brief.
 */
export function AgentBuilder({
  onCreateTask,
  onOpenStudio,
  onOpenSession,
  isStreaming,
  error,
  selection,
}: AgentBuilderProps) {
  const [state, dispatch] = useReducer(agentReducer, selection, (seed) =>
    initialAgentState(
      seed ?? loadSelection(typeof window === "undefined" ? null : window.sessionStorage) ?? AGENT_DEFAULTS
    )
  );

  const plan = useMemo(() => planFor(state.out, state.depth), [state.out, state.depth]);
  const reduced = useReducedMotion();

  /* The plan card is rebuilt on every choice; a short fade says what moved. */
  const planSig = `${plan.total}|${plan.credits}|${plan.rows.map((r) => `${r.name}${r.sub}${r.time}`).join("|")}`;
  const mounted = useRef(false);
  const [redrawing, setRedrawing] = useState(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (reduced) return;
    setRedrawing(true);
    const timer = window.setTimeout(() => setRedrawing(false), 220);
    return () => window.clearTimeout(timer);
  }, [planSig, reduced]);

  /* The prototype keeps the draft in memory; the same is true across a hand-off here. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    saveSelection(window.sessionStorage, state);
  }, [state]);

  /* A run that started means the builder did its job. */
  useEffect(() => {
    if (isStreaming && state.status === "submitting") dispatch({ type: "started" });
  }, [isStreaming, state.status]);

  /* The chat reports a failed send; a 402 is the workspace being out of credits. */
  const lastError = useRef<string | null>(null);
  useEffect(() => {
    if (error && error !== lastError.current) {
      lastError.current = error;
      dispatch({ type: "failed", message: error });
    } else if (!error) {
      lastError.current = null;
    }
  }, [error]);

  const start = usePersistFn(() => {
    if (state.status === "submitting") return;
    if (state.out === "image") {
      onOpenStudio();
      return;
    }
    dispatch({ type: "start" });
    if (briefNotice(state.brief)) return;
    const finish = () => {
      dispatch({ type: "started" });
      onOpenSession();
    };
    Promise.resolve(onCreateTask(requestText(state, plan))).then(finish, (err: unknown) =>
      dispatch({ type: "failed", message: err instanceof Error ? err.message : String(err) })
    );
  });

  return (
    <AgentScreen
      agent={state}
      plan={plan}
      status={state.status}
      notice={state.notice}
      redrawing={redrawing}
      onSelectOutput={(id) => dispatch({ type: "selectOutput", id })}
      onBrief={(value) => dispatch({ type: "setBrief", value })}
      onSelectDepth={(id) => dispatch({ type: "setDepth", id })}
      onToggleSource={(id) => dispatch({ type: "toggleSource", id })}
      onNotify={(value) => dispatch({ type: "setNotify", value })}
      onStart={start}
    />
  );
}

export default AgentBuilder;
