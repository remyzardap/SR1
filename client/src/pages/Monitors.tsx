import { Fragment, useCallback, useEffect, useState } from "react";
import { Loader2, Pause } from "lucide-react";
import { Streamdown } from "streamdown";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { callFunction } from "@/lib/kemmaCloud";
import { downloadResearchMarkdown, downloadResearchPdf } from "@/lib/researchReports";
import { toast } from "sonner";

interface Monitor {
  id: string;
  topic: string;
  frequency: "daily" | "weekly";
  active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

interface MonitorRun {
  id: string;
  monitor_id: string;
  report: string;
  sources: Array<{ title: string; url: string }>;
  created_at: string;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function Monitors() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [runs, setRuns] = useState<MonitorRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [topic, setTopic] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("weekly");
  const [creating, setCreating] = useState(false);
  const [openRun, setOpenRun] = useState<MonitorRun | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [m, r] = await Promise.all([
        callFunction<{ monitors: Monitor[] }>("monitors", { action: "list" }),
        callFunction<{ runs: MonitorRun[] }>("monitors", { action: "runs" }),
      ]);
      setMonitors(m.monitors);
      setRuns(r.runs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load monitors.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (topic.trim().length < 5 || creating) return;
    setCreating(true);
    try {
      await callFunction("monitors", { action: "create", topic: topic.trim(), frequency });
      setTopic("");
      toast.success("Monitor created — the first briefing runs shortly.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the monitor.");
    } finally {
      setCreating(false);
    }
  }

  async function toggle(m: Monitor) {
    try {
      await callFunction("monitors", { action: "setActive", id: m.id, active: !m.active });
      setMonitors((prev) => prev.map((x) => (x.id === m.id ? { ...x, active: !m.active } : x)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the monitor.");
    }
  }

  async function remove(m: Monitor) {
    try {
      await callFunction("monitors", { action: "remove", id: m.id });
      setMonitors((prev) => prev.filter((x) => x.id !== m.id));
      setRuns((prev) => prev.filter((x) => x.monitor_id !== m.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the monitor.");
    }
  }

  function exportRun(run: MonitorRun, kind: "md" | "pdf") {
    const monitor = monitors.find((m) => m.id === run.monitor_id);
    const report = { question: monitor?.topic || "Research briefing", answer: run.report, sources: run.sources, mode: "deep" as const, model: "openai/gpt-6-astra", createdAt: new Date(run.created_at) };
    if (kind === "md") downloadResearchMarkdown(report);
    else downloadResearchPdf(report);
  }

  // Display-only summaries of data the page already holds.
  const activeCount = monitors.filter((m) => m.active).length;
  const nextRunAt = monitors.reduce<string | null>(
    (earliest, m) =>
      m.active && m.next_run_at && (!earliest || new Date(m.next_run_at) < new Date(earliest)) ? m.next_run_at : earliest,
    null,
  );

  return (
    <div className="sk-page mx-auto w-full max-w-[1240px]">
      <header className="sk-header">
        <div>
          <h1 className="sk-h1">Research on autopilot</h1>
          <p className="sk-sub">
            Kemma re-investigates your topics on a schedule and files a fresh cited briefing each run.
          </p>
        </div>
        <div className="sk-actions">
          <button type="button" className="sk-btn" onClick={() => void create()} disabled={creating || topic.trim().length < 5}>
            {creating && <Loader2 className="size-4 animate-spin" aria-hidden="true" />} Monitor
          </button>
        </div>
      </header>

      {/* New monitor */}
      <div className="sk-card mb-7">
        <span className="sk-label mb-3">New monitor</span>
        <div className="sk-row">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void create()}
            placeholder="e.g. Indonesian nickel export policy changes"
            aria-label="Topic to monitor"
            className="sk-input min-w-0 flex-1"
          />
          <div className="sk-filters" role="group" aria-label="Frequency">
            {(["daily", "weekly"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFrequency(f)}
                className={`sk-pill uppercase tracking-wider ${frequency === f ? "is-active" : ""}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="sk-card sk-empty">
          <span className="sk-label">Monitors</span>
          <p className="sk-empty-text">Loading monitors&hellip;</p>
        </div>
      )}

      {error && (
        <div className="sk-card sk-empty">
          <span className="sk-label">Error</span>
          <p className="sk-empty-text">{error}</p>
          <button type="button" className="sk-btn sk-btn-sm mt-2 self-start" onClick={() => void load()}>Try again</button>
        </div>
      )}

      {!loading && !error && monitors.length === 0 && (
        <div className="sk-card sk-empty">
          <span className="sk-label">No monitors yet</span>
          <p className="sk-empty-text">Add a topic above and Kemma will keep an eye on it.</p>
        </div>
      )}

      {monitors.length > 0 && (
        <>
          <div className="sk-grid-3 mb-7">
            <div className="sk-card sk-stat">
              <span className="sk-label">Active monitors</span>
              <p className="sk-stat-num">{activeCount}</p>
            </div>
            <div className="sk-card sk-stat">
              <span className="sk-label">Briefings on file</span>
              <p className="sk-stat-num">{runs.length}</p>
            </div>
            <div className="sk-card sk-stat">
              <span className="sk-label">Next run</span>
              <p className="sk-stat-num" style={{ fontSize: 26, lineHeight: 1.25 }}>{nextRunAt ? fmtDate(nextRunAt) : "--"}</p>
            </div>
          </div>

          <div className="sk-tablewrap" style={{ overflowX: "auto" }}>
            <table className="sk-table">
              <thead>
                <tr>
                  <th>Monitor</th>
                  <th>Schedule</th>
                  <th>Last run</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {monitors.map((m) => {
                  const monitorRuns = runs.filter((r) => r.monitor_id === m.id);
                  return (
                    <Fragment key={m.id}>
                      <tr>
                        <td>
                          <div className="sk-between">
                            <p className="sk-td-title min-w-0 flex-1">{m.topic}</p>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                className="sk-icon-btn"
                                onClick={() => void toggle(m)}
                                aria-label={m.active ? "Pause monitor" : "Resume monitor"}
                                title={m.active ? "Pause" : "Resume"}
                              >
                                {m.active ? <Pause aria-hidden="true" /> : <SutaeruIcon name="play" />}
                              </button>
                              <button
                                type="button"
                                className="sk-icon-btn"
                                onClick={() => void remove(m)}
                                aria-label="Delete monitor"
                                title="Delete"
                              >
                                <SutaeruIcon name="delete" />
                              </button>
                            </div>
                          </div>
                          {monitorRuns.length > 0 && (
                            <div className="mt-1.5 flex flex-col items-start gap-1">
                              {monitorRuns.slice(0, 3).map((run) => (
                                <button
                                  key={run.id}
                                  type="button"
                                  onClick={() => setOpenRun(openRun?.id === run.id ? null : run)}
                                  className="sk-meta cursor-pointer text-left underline-offset-2 hover:underline"
                                >
                                  Briefing from {fmtDate(run.created_at)} ({run.sources.length} sources)
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="sk-td-mono">
                          <span className="block">{m.frequency}</span>
                          <span className="block">{m.active ? `next run ${fmtDate(m.next_run_at)}` : "paused"}</span>
                        </td>
                        <td className="sk-td-mono">{fmtDate(m.last_run_at)}</td>
                        <td>
                          <span className={`sk-chip ${m.active ? "sk-chip-idle" : "sk-chip-paused"}`}>
                            <span className="sk-dot" aria-hidden="true" />
                            {m.active ? "Idle" : "Paused"}
                          </span>
                        </td>
                      </tr>
                      {openRun && openRun.monitor_id === m.id && (
                        <tr>
                          <td colSpan={4} style={{ height: "auto", padding: "0 28px 24px" }}>
                            <div style={{ background: "var(--art-paper)", borderRadius: 20, padding: 20 }}>
                              <div className="mb-2 flex justify-end gap-2">
                                <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => exportRun(openRun, "md")}>Markdown</button>
                                <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => exportRun(openRun, "pdf")}>PDF</button>
                              </div>
                              <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                                <Streamdown>{openRun.report}</Streamdown>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
