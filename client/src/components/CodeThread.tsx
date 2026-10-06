import { useCallback, useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import type { Attachment } from "@/lib/attachments";
import { getAuthToken } from "@/lib/authSession";
import "@/styles/code-sessions.css";

/** Code mode: the coding agent running on the server, shown inside a normal chat thread. Admin only. */

export type CodeStatus = "running" | "done" | "needs_approval" | "error" | "stopped" | "capped" | "interrupted";
export type CodeAccess = "read" | "edit" | "full";

export interface CodeSession {
  id: string;
  title: string;
  status: CodeStatus;
  mode: CodeAccess;
  provider?: string;
  spent_usd: number;
  updated: number;
  pending_approvals: Array<{ id: string; tool: string; input?: Record<string, unknown> }>;
}

interface Ev {
  n: number;
  type: "claude" | "sutaeru";
  kind?: string;
  text?: string;
  provider?: string;
  next?: string;
  event?: { type?: string; message?: { content?: Array<Record<string, any>> } };
}

/**
 * Notes and faults echoed by the session daemon can name the backend that ran
 * ("Claude Code is not installed", provider labels in limit notes). Nothing on
 * screen says which model answered, so those names are masked at render.
 */
const BACKEND_WORDS = /\b(?:claude(?:\s+code)?|anthropic|openai|gpt-[\w.+-]+|gemini|qwen|sonar|kimi|vertex(?:\s+ai)?|litellm|koboi\w*)\b/gi;
function hideBackends(text: string): string {
  return text.replace(BACKEND_WORDS, "the coding tool").replace(/\bthe coding tool(?:\s+the coding tool)+/gi, "the coding tool");
}

class GateError extends Error {
  constructor(message: string, public reason?: string) { super(message); }
}

const BASE = `${import.meta.env.VITE_SR1_API_ORIGIN || ""}/api/admin/code-sessions`;

export async function codeCall<T>(path: string, body?: unknown): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 403) throw new GateError((data as any).error || "Not allowed.", (data as any).reason);
  if (!res.ok) throw new Error((data as any).error || `Request failed (${res.status}).`);
  return data as T;
}

/** Which chat thread belongs to which code session. Local to this browser, never required for correctness. */
const key = (chatSessionId: string) => `sutaeru_code_${chatSessionId}`;
export function storedCodeSession(chatSessionId: string): string | null {
  try { return localStorage.getItem(key(chatSessionId)); } catch { return null; }
}
export function rememberCodeSession(chatSessionId: string, codeSessionId: string) {
  try { localStorage.setItem(key(chatSessionId), codeSessionId); } catch { /* storage can be blocked */ }
}

function stepLabel(name: string, input: Record<string, any> = {}): string {
  const target = input.file_path || input.path || input.pattern || input.command || input.url || input.query || "";
  const short = String(target).replace(/^\/root\//, "~/").slice(0, 90);
  return short ? `${name} · ${short}` : name;
}

export function accessLabel(mode: CodeAccess): string {
  return mode === "full" ? "Full access" : mode === "edit" ? "Can edit" : "Read only";
}

export interface CodeThreadApi {
  active: boolean;
  session: CodeSession | null;
  events: Ev[];
  running: boolean;
  needsApproval: boolean;
  gate: GateError | null;
  busy: boolean;
  fullAvailable: boolean;
  send: (text: string, opts: { access: CodeAccess; totp?: string; attachments?: Attachment[] }) => Promise<boolean>;
  stop: () => Promise<void>;
  decide: (deny: boolean) => Promise<void>;
}

/** Everything Chat needs for Code mode on one thread: start or continue the session, poll it, stop it, approve actions. */
export function useCodeThread(chatSessionId: string, active: boolean): CodeThreadApi {
  const [codeId, setCodeId] = useState<string | null>(() => storedCodeSession(chatSessionId));
  const [session, setSession] = useState<CodeSession | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [gate, setGate] = useState<GateError | null>(null);
  const [busy, setBusy] = useState(false);
  const [fullAvailable, setFullAvailable] = useState(false);
  const after = useRef(0);

  // A different thread means a different code session: reset and pick up the stored one.
  useEffect(() => {
    setCodeId(storedCodeSession(chatSessionId));
    setSession(null);
    setEvents([]);
    setGate(null);
    after.current = 0;
  }, [chatSessionId]);

  useEffect(() => {
    if (!active) return;
    codeCall<{ fullAvailable?: boolean }>("/status").then((s) => setFullAvailable(Boolean(s.fullAvailable))).catch((e) => { if (e instanceof GateError) setGate(e); });
  }, [active]);

  const poll = useCallback(async () => {
    if (!codeId) return;
    try {
      const d = await codeCall<{ session: CodeSession; events: Ev[] }>(`/${codeId}?after=${after.current}`);
      setSession(d.session);
      if (d.events.length) {
        after.current = d.events[d.events.length - 1].n + 1;
        setEvents((prev) => [...prev, ...d.events]);
      }
    } catch (e) {
      if (e instanceof GateError) setGate(e);
    }
  }, [codeId]);

  useEffect(() => {
    after.current = 0;
    setEvents([]);
    if (active && codeId) void poll();
  }, [codeId, active, poll]);

  const running = session?.status === "running";
  useEffect(() => {
    if (!active || !codeId) return;
    const t = window.setInterval(poll, running ? 1500 : 5000);
    return () => window.clearInterval(t);
  }, [active, codeId, poll, running]);

  const send: CodeThreadApi["send"] = async (text, { access, totp, attachments }) => {
    setBusy(true);
    try {
      const extra = attachments && attachments.length > 0 ? { attachments } : {};
      if (!codeId) {
        const s = await codeCall<CodeSession>("/", { prompt: text, mode: access, ...(access === "full" ? { totp } : {}), ...extra });
        rememberCodeSession(chatSessionId, s.id);
        setCodeId(s.id);
      } else {
        await codeCall(`/${codeId}/message`, { text, ...extra });
        await poll();
      }
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send that to Code mode.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const act = async (path: string, body: unknown) => {
    if (!codeId) return;
    setBusy(true);
    try {
      await codeCall(`/${codeId}${path}`, body);
      await poll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  return {
    active, session, events, running, gate, busy, fullAvailable,
    needsApproval: session?.status === "needs_approval",
    send,
    stop: () => act("/stop", {}),
    decide: (deny) => act("/approve", deny ? { deny: true } : {}),
  };
}

/** The running row in Code mode: the same step language as the chat transcript.
 *  The session reports no total and no finish time, so this shows the live step and
 *  its count instead of an invented percentage. */
function CodeRunStep({ events }: { events: Ev[] }) {
  const steps = events.flatMap((e) =>
    e.type === "claude" && e.event?.type === "assistant"
      ? (e.event.message?.content ?? []).filter((b) => b.type === "tool_use")
      : [],
  );
  const last = steps[steps.length - 1];
  const label = last ? stepLabel(String(last.name ?? ""), last.input ?? {}) : "Working";

  return (
    <div className="sk-run-card is-live" role="status" aria-live="polite">
      <div className="sk-run-head">
        <span className="sk-run-dot" aria-hidden="true" />
        <span className="sk-run-label">{label}</span>
        {steps.length > 0 && <span className="sk-run-step">STEP {steps.length}</span>}
      </div>
      <span className="sk-run-track" aria-hidden="true" />
    </div>
  );
}

/** The conversation: your messages, Sutaeru's replies, one pill per step, notes, and the approval card. */
export function CodeThreadView({ code }: { code: CodeThreadApi }) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [code.events.length, code.session?.status]);

  if (code.gate) {
    return (
      <div className="cs-thread">
        <div className="cs-card">
          <h2 className="cs-card-title">Code mode is locked</h2>
          <p className="cs-muted">{code.gate.message}</p>
        </div>
      </div>
    );
  }
  const s = code.session;
  return (
    <div className="cs-thread">
      {!s && code.events.length === 0 && (
        <div className="cs-empty">
          <h2 className="cs-card-title">Code mode</h2>
          <p className="cs-muted">Ask for a change or a question about your server. It can read files, search and, if you allow it, edit.</p>
        </div>
      )}
      {s && (
        <p className="cs-muted cs-small cs-meta">
          {accessLabel(s.mode)} · ${s.spent_usd.toFixed(2)} so far
        </p>
      )}
      <div className="cs-timeline">
        {code.events.map((e) => {
          if (e.type === "sutaeru") {
            if (e.kind === "user") return <div key={e.n} className="cs-me">{e.text}</div>;
            if (e.kind === "provider_limit") return <div key={e.n} className="cs-note cs-warn">The code backend hit its limit{e.next ? ", trying another one" : ""}.</div>;
            if (e.kind === "provider") return null; // which backend answers is not shown; the note stays in the data
            if (["error", "budget", "approved", "denied"].includes(e.kind || "")) return <div key={e.n} className={`cs-note ${e.kind === "error" ? "cs-warn" : ""}`}>{hideBackends(e.text || "")}</div>;
            return null;
          }
          const ev = e.event;
          if (ev?.type !== "assistant") return null;
          return (
            <div key={e.n}>
              {ev.message?.content?.map((b, i) => {
                if (b.type === "text" && b.text?.trim()) return <div key={i} className="cs-reply"><Streamdown>{b.text}</Streamdown></div>;
                if (b.type === "tool_use") return <div key={i} className="cs-step">{stepLabel(b.name, b.input)}</div>;
                return null;
              })}
            </div>
          );
        })}
      </div>
      {code.running && <CodeRunStep events={code.events} />}
      {code.needsApproval && s && (
        <div className="cs-approve" role="alert">
          <strong>Sutaeru wants to do this</strong>
          {s.pending_approvals.map((a) => (
            <pre key={a.id} className="cs-code">{a.tool}: {String(a.input?.command ?? a.input?.file_path ?? JSON.stringify(a.input)).slice(0, 400)}</pre>
          ))}
          <div className="cs-row">
            <button className="sk-btn sk-btn-ghost" disabled={code.busy} onClick={() => void code.decide(true)}>Decline</button>
            <button className="sk-btn" disabled={code.busy} onClick={() => void code.decide(false)}>Approve</button>
          </div>
        </div>
      )}
      <div ref={bottom} />
    </div>
  );
}

/** Access choice shown above the composer in Code mode. Full access needs a fresh two-factor code. */
export function CodeAccessBar({
  access, onAccess, totp, onTotp, fullAvailable, locked,
}: {
  access: CodeAccess; onAccess: (a: CodeAccess) => void; totp: string; onTotp: (v: string) => void; fullAvailable: boolean; locked: boolean;
}) {
  return (
    <div className="cs-accessbar">
      <div className="cs-mode-row">
        <div className="cs-seg" role="radiogroup" aria-label="Access">
          <button role="radio" aria-checked={access === "read"} disabled={locked} className={access === "read" ? "on" : ""} onClick={() => onAccess("read")}>Read only</button>
          <button role="radio" aria-checked={access === "edit"} disabled={locked} className={access === "edit" ? "on" : ""} onClick={() => onAccess("edit")}>Can edit</button>
        </div>
        {fullAvailable && (
          <button type="button" disabled={locked} className={`cs-full-btn ${access === "full" ? "on" : ""}`} onClick={() => onAccess(access === "full" ? "read" : "full")}>Full access</button>
        )}
      </div>
      {locked && <p className="cs-muted cs-small">Access is fixed for this session.</p>}
      {!locked && access === "full" && (
        <>
          <p className="cs-warn-line">Full access lets Sutaeru run any command on the server as root without asking. Known secret files are blocked and a 30 minute limit applies, but a command can get around the file rules. Use it only for tasks you trust.</p>
          <input
            type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6}
            className="cs-input cs-totp-input" placeholder="6-digit 2FA code" aria-label="Authenticator code"
            value={totp} onChange={(e) => onTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </>
      )}
    </div>
  );
}
