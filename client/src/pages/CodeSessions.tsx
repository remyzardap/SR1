import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Loader2 } from "lucide-react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import { AttachMenu } from "@/components/AttachMenu";
import type { Attachment } from "@/lib/attachments";
import { getAuthToken } from "@/lib/authSession";
import "@/styles/code-sessions.css";

type Status = "running" | "done" | "needs_approval" | "error" | "stopped" | "capped" | "interrupted";

interface Session {
  id: string;
  title: string;
  status: Status;
  mode: "read" | "edit" | "full";
  provider?: string;
  spent_usd: number;
  budget_usd: number;
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
  status?: string;
  event?: { type?: string; message?: { content?: Array<Record<string, any>> } };
}

class GateError extends Error {
  constructor(message: string, public reason?: string) { super(message); }
}

const BASE = `${import.meta.env.VITE_SR1_API_ORIGIN || ""}/api/admin/code-sessions`;

async function call<T>(path: string, body?: unknown): Promise<T> {
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

const STATUS_LABEL: Record<Status, string> = {
  running: "Working", done: "Done", needs_approval: "Needs you", error: "Problem",
  stopped: "Stopped", capped: "Spend cap hit", interrupted: "Interrupted",
};

function modeLabel(mode: "read" | "edit" | "full"): string {
  if (mode === "full") return "Full access";
  if (mode === "edit") return "Can edit";
  return "Read only";
}

function ago(ts: number): string {
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** One short line describing what a tool call is doing. */
function stepLabel(name: string, input: Record<string, any> = {}): string {
  const target = input.file_path || input.path || input.pattern || input.command || input.url || input.query || "";
  const short = String(target).replace(/^\/root\//, "~/").slice(0, 90);
  return short ? `${name} · ${short}` : name;
}

function Gate({ error }: { error: GateError }) {
  const [, go] = useLocation();
  return (
    <div className="cs-card">
      <h2 className="cs-card-title">Code sessions are locked</h2>
      <p className="cs-muted">{error.message}</p>
      {error.reason === "2fa" && <button className="sk-btn" onClick={() => go("/settings")}>Open Settings</button>}
    </div>
  );
}

function SessionList() {
  const [, go] = useLocation();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [gate, setGate] = useState<GateError | null>(null);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"read" | "edit" | "full">("read");
  const [totp, setTotp] = useState("");
  const [fullAvailable, setFullAvailable] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sRes, statusRes] = await Promise.all([
        call<{ sessions: Session[] }>("/"),
        call<{ ok: boolean; fullAvailable?: boolean }>("/status").catch(() => ({ ok: false, fullAvailable: false })),
      ]);
      setSessions(sRes.sessions);
      setFullAvailable(Boolean(statusRes.fullAvailable));
      setGate(null);
    } catch (e) {
      if (e instanceof GateError) setGate(e);
      else toast.error(e instanceof Error ? e.message : "Could not load sessions.");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(load, 5000);
    return () => window.clearInterval(t);
  }, [load]);

  async function start() {
    const trimmed = prompt.trim();
    if ((!trimmed && attachments.length === 0) || busy) return;
    if (mode === "full" && totp.length !== 6) {
      toast.error("Enter a 6-digit authenticator code for full access.");
      return;
    }
    setBusy(true);
    try {
      const s = await call<Session>("/", {
        prompt: trimmed || "Inspect the attached files.",
        mode,
        ...(mode === "full" ? { totp } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      setAttachments([]);
      setTotp("");
      go(`/sessions/${s.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the session.");
    } finally {
      setBusy(false);
    }
  }

  if (gate) return <Gate error={gate} />;
  const canStart = (prompt.trim().length > 0 || attachments.length > 0) && !busy && (mode !== "full" || totp.length === 6);
  return (
    <>
      <div className="cs-card">
        <label className="cs-label" htmlFor="cs-task">New session</label>
        <textarea id="cs-task" className="cs-input" rows={3} value={prompt} placeholder="What should Claude Code do on the server?" onChange={(e) => setPrompt(e.target.value)} />
        <div className="cs-attach-slot">
          <AttachMenu attachments={attachments} onChange={setAttachments} disabled={busy} />
        </div>
        <div className="cs-row">
          <div className="cs-mode-row">
            <div className="cs-seg" role="radiogroup" aria-label="Access">
              <button role="radio" aria-checked={mode === "read"} className={mode === "read" ? "on" : ""} onClick={() => setMode("read")}>Read only</button>
              <button role="radio" aria-checked={mode === "edit"} className={mode === "edit" ? "on" : ""} onClick={() => setMode("edit")}>Can edit</button>
            </div>
            {fullAvailable && (
              <button
                type="button"
                className={`cs-full-btn ${mode === "full" ? "on" : ""}`}
                onClick={() => setMode(mode === "full" ? "read" : "full")}
              >
                Full access
              </button>
            )}
          </div>
          <button className="sk-btn" disabled={!canStart} onClick={start}>{busy ? <Loader2 size={16} className="animate-spin" /> : "Start"}</button>
        </div>
        {mode === "full" ? (
          <>
            <p className="cs-warn-line">
              Full access lets Claude run any command on the server as root without asking. Known secret files are blocked and the spend cap and 30 minute limit still apply, but a command can get around the file rules. Use it only for tasks you trust.
            </p>
            <div className="cs-totp-group">
              <label htmlFor="cs-totp" className="cs-label">Authenticator code</label>
              <input
                id="cs-totp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                className="cs-input cs-totp-input"
                placeholder="6-digit 2FA code"
                value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </div>
          </>
        ) : (
          <p className="cs-muted cs-small">{mode === "read" ? "It can look at files and search, nothing else." : "It can edit files and run safe checks. Anything riskier asks you first."}</p>
        )}
      </div>

      <h2 className="cs-section">Sessions</h2>
      {sessions === null && <p className="cs-muted">Loading…</p>}
      {sessions?.length === 0 && <p className="cs-muted">No sessions yet.</p>}
      <ul className="cs-list">
        {sessions?.map((s) => (
          <li key={s.id}>
            <button className="cs-item" onClick={() => go(`/sessions/${s.id}`)}>
              <span className="cs-item-title">{s.title}</span>
              <span className="cs-item-meta">
                <span className={`cs-pill cs-${s.status}`}>{STATUS_LABEL[s.status] ?? s.status}</span>
                <span>{ago(s.updated)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Timeline({ events }: { events: Ev[] }) {
  return (
    <div className="cs-timeline">
      {events.map((e) => {
        if (e.type === "sutaeru") {
          if (e.kind === "user") return <div key={e.n} className="cs-me">{e.text}</div>;
          if (e.kind === "provider_limit") return <div key={e.n} className="cs-note cs-warn">{e.text}</div>;
          if (e.kind === "provider") return e.provider && e.provider !== "anthropic" ? <div key={e.n} className="cs-note">Running on {e.provider}</div> : null;
          if (["error", "budget", "approved", "denied"].includes(e.kind || "")) return <div key={e.n} className={`cs-note ${e.kind === "error" ? "cs-warn" : ""}`}>{e.text}</div>;
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
  );
}

function SessionView({ id }: { id: string }) {
  const [, go] = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [gate, setGate] = useState<GateError | null>(null);
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const after = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const d = await call<{ session: Session; events: Ev[] }>(`/${id}?after=${after.current}`);
      setSession(d.session);
      if (d.events.length) {
        after.current = d.events[d.events.length - 1].n + 1;
        setEvents((prev) => [...prev, ...d.events]);
      }
    } catch (e) {
      if (e instanceof GateError) setGate(e);
    }
  }, [id]);

  useEffect(() => {
    after.current = 0;
    setEvents([]);
    void poll();
  }, [id, poll]);

  const running = session?.status === "running";
  useEffect(() => {
    const t = window.setInterval(poll, running ? 1500 : 5000);
    return () => window.clearInterval(t);
  }, [poll, running]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [events.length, session?.status]);

  async function act(path: string, body: unknown, ok?: string) {
    setBusy(true);
    try {
      await call(`/${id}${path}`, body);
      if (ok) toast.success(ok);
      await poll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  if (gate) return <Gate error={gate} />;
  if (!session) return <p className="cs-muted">Loading…</p>;
  return (
    <div className="cs-view">
      <button className="cs-back" onClick={() => go("/sessions")}>← Sessions</button>
      <div className="cs-view-head">
        <h2 className="cs-card-title">{session.title}</h2>
        <span className={`cs-pill cs-${session.status}`}>{STATUS_LABEL[session.status] ?? session.status}</span>
      </div>
      <p className="cs-muted cs-small">
        {modeLabel(session.mode)} · {session.provider ?? "starting"} · ${session.spent_usd.toFixed(2)} of ${session.budget_usd.toFixed(2)}
      </p>

      <Timeline events={events} />
      {running && <div className="cs-working"><Loader2 size={14} className="animate-spin" /> Working…</div>}

      {session.status === "needs_approval" && (
        <div className="cs-approve" role="alert">
          <strong>Claude wants to do this</strong>
          {session.pending_approvals.map((a) => (
            <pre key={a.id} className="cs-code">{a.tool}: {String(a.input?.command ?? a.input?.file_path ?? JSON.stringify(a.input)).slice(0, 400)}</pre>
          ))}
          <div className="cs-row">
            <button className="sk-btn sk-btn-ghost" disabled={busy} onClick={() => act("/approve", { deny: true })}>Decline</button>
            <button className="sk-btn" disabled={busy} onClick={() => act("/approve", {}, "Approved")}>Approve</button>
          </div>
        </div>
      )}
      <div ref={bottom} />

      <div className="cs-composer">
        {running ? (
          <button className="sk-btn sk-btn-ghost cs-wide" disabled={busy} onClick={() => act("/stop", {})}>Stop</button>
        ) : (
          <>
            <div className="cs-attach-slot cs-wide">
              <AttachMenu attachments={attachments} onChange={setAttachments} disabled={busy || session.status === "needs_approval"} />
            </div>
            <textarea
              className="cs-input"
              rows={2}
              value={text}
              placeholder="Reply to Claude…"
              onChange={(e) => setText(e.target.value)}
              disabled={session.status === "needs_approval"}
            />
            <button
              className="sk-btn"
              disabled={(!text.trim() && attachments.length === 0) || busy || session.status === "needs_approval"}
              onClick={async () => {
                const t = text.trim() || "Inspect the attached files.";
                const atts = attachments;
                setText("");
                setAttachments([]);
                await act("/message", { text: t, ...(atts.length > 0 ? { attachments: atts } : {}) });
              }}
            >
              Send
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function CodeSessions() {
  const [match, params] = useRoute("/sessions/:id");
  return (
    <div className="sk-page cs-page">
      <div className="sk-header">
        <div>
          <h1 className="sk-h1">Code sessions</h1>
          <p className="sk-sub">Claude Code on your server, from your phone.</p>
        </div>
      </div>
      {match && params ? <SessionView id={params.id} /> : <SessionList />}
    </div>
  );
}
