import { Fragment, useCallback, useEffect, useState } from "react";
import { Streamdown } from "streamdown";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { callFunction } from "@/lib/kemmaCloud";
import { downloadResearchMarkdown, downloadResearchPdf } from "@/lib/researchReports";
import { toast } from "sonner";
import { Chip, SteppedMeter, StatusPill, type StatusPillStatus } from "@/components/art";
import { PageTitle } from "@/components/chrome/PageTitle";
import "@/styles/list-pages.css";

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

/** Activity meter window: one segment per day, so eight days fill the eight segments. */
const ACTIVITY_DAYS = 8;

function fmtDate(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** The canvas shows the next run as a 24-hour clock, which also keeps it on one line. */
function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Days with at least one briefing inside the activity window, for one monitor. */
function activeDays(runs: MonitorRun[], now: Date): number {
  const since = now.getTime() - ACTIVITY_DAYS * 24 * 60 * 60 * 1000;
  const days = new Set<string>();
  for (const run of runs) {
    const at = new Date(run.created_at);
    if (at.getTime() >= since) days.add(at.toDateString());
  }
  return days.size;
}

/**
 * A monitor whose slot has come due and has not filed its briefing yet is the one
 * being worked right now; the runner only moves next_run_at after a briefing lands.
 */
function monitorStatus(m: Monitor, now: Date): StatusPillStatus {
  if (!m.active) return "paused";
  if (m.next_run_at && new Date(m.next_run_at).getTime() <= now.getTime()) return "running";
  return "idle";
}

/** Mono cadence line, with the hour it next runs: DAILY 09:00, WEEKLY 14:30. */
function scheduleLabel(m: Monitor): string {
  if (!m.active) return "Paused";
  if (!m.next_run_at) return m.frequency;
  return `${m.frequency} ${fmtClock(m.next_run_at)}`;
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
  const now = new Date();
  const activeCount = monitors.filter((m) => m.active).length;
  const runsToday = runs.filter((r) => isSameDay(new Date(r.created_at), now)).length;
  const nextRunAt = monitors.reduce<string | null>(
    (earliest, m) =>
      m.active && m.next_run_at && (!earliest || new Date(m.next_run_at) < new Date(earliest)) ? m.next_run_at : earliest,
    null,
  );
  const nextRunLabel = !nextRunAt
    ? "--"
    : isSameDay(new Date(nextRunAt), now)
      ? fmtClock(nextRunAt)
      : new Date(nextRunAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className="lp-page">
      <header className="lp-head">
        <div className="lp-head-main">
          <PageTitle className="lp-title">Monitors</PageTitle>
          <p className="lp-lede">
            Kemma re-investigates your topics on a schedule and files a fresh cited briefing each run.
          </p>
        </div>
      </header>

      {/* New monitor */}
      <section className="lp-card lp-stack" style={{ gap: 14 }}>
        <span className="lp-mono">New monitor</span>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void create()}
          placeholder="e.g. Indonesian nickel export policy changes"
          aria-label="Topic to monitor"
          className="lp-field"
        />
        <div className="lp-chips lp-chips-scroll" role="group" aria-label="Frequency">
          {(["daily", "weekly"] as const).map((f) => (
            <Chip key={f} active={frequency === f} onClick={() => setFrequency(f)}>
              {f === "daily" ? "Every day" : "Every week"}
            </Chip>
          ))}
        </div>
        <button
          type="button"
          className="lp-btn lp-btn-self"
          onClick={() => void create()}
          disabled={creating || topic.trim().length < 5}
        >
          {creating ? "Adding..." : "Add monitor"}
        </button>
      </section>

      {loading && (
        <ul className="lp-rows" style={{ marginTop: 20 }} aria-label="Loading monitors">
          {[0, 1, 2].map((i) => (
            <li key={i} className="lp-row">
              <div className="lp-row-main">
                <span className="lp-skeleton" style={{ width: "52%", height: 20 }} />
                <span className="lp-skeleton" style={{ width: "26%", height: 11 }} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <section className="lp-empty" style={{ marginTop: 20 }}>
          <span className="lp-mono" style={{ color: "var(--r-alert)" }}>Error</span>
          <p className="lp-empty-text">{error}</p>
          <button type="button" className="lp-btn lp-btn-sm" onClick={() => void load()}>Try again</button>
        </section>
      )}

      {!loading && !error && monitors.length === 0 && (
        <section className="lp-empty" style={{ marginTop: 20 }}>
          <span className="lp-empty-mark"><SutaeruIcon name="schedule" width={44} height={44} /></span>
          <h2 className="lp-empty-title">Nothing watched yet.</h2>
          <p className="lp-empty-text">Add a topic above and Kemma will keep an eye on it.</p>
        </section>
      )}

      {monitors.length > 0 && (
        <>
          <div className="lp-stats lp-section">
            <div className="lp-stat">
              <span className="lp-mono">Active</span>
              <span className="lp-stat-num lp-num">{activeCount}</span>
            </div>
            <div className="lp-stat">
              <span className="lp-mono">Runs today</span>
              <span className="lp-stat-num lp-num">{runsToday}</span>
            </div>
            <div className="lp-stat">
              <span className="lp-mono">Next</span>
              <span className="lp-stat-num lp-stat-num-sm lp-num">{nextRunLabel}</span>
            </div>
          </div>

          <ul className="lp-rows" style={{ marginTop: 20 }}>
            {monitors.map((m) => {
              const monitorRuns = runs.filter((r) => r.monitor_id === m.id);
              const status = monitorStatus(m, now);
              return (
                <Fragment key={m.id}>
                  <li className="lp-card lp-mon">
                    <div className="lp-mon-top">
                      <h2 className="lp-mon-title">{m.topic}</h2>
                      <SteppedMeter
                        value={activeDays(monitorRuns, now) / ACTIVITY_DAYS}
                        segments={ACTIVITY_DAYS}
                        variant="col"
                        ariaLabel={`${activeDays(monitorRuns, now)} of the last ${ACTIVITY_DAYS} days with a briefing`}
                        className="lp-mon-meter"
                      />
                    </div>
                    <div className="lp-mon-bottom">
                      <span className="lp-mono">{scheduleLabel(m)}</span>
                      <div className="lp-row-side">
                        <StatusPill status={status} />
                        <button
                          type="button"
                          className="lp-icon-btn"
                          onClick={() => void toggle(m)}
                          aria-label={m.active ? "Pause monitor" : "Resume monitor"}
                          title={m.active ? "Pause" : "Resume"}
                        >
                          <SutaeruIcon name={m.active ? "pause" : "play"} />
                        </button>
                        <button
                          type="button"
                          className="lp-icon-btn"
                          onClick={() => void remove(m)}
                          aria-label="Delete monitor"
                          title="Delete"
                        >
                          <SutaeruIcon name="delete" />
                        </button>
                      </div>
                    </div>
                    {monitorRuns.length > 0 && (
                      <div className="lp-mon-runs">
                        <hr className="lp-hairline" />
                        {monitorRuns.slice(0, 3).map((run) => (
                          <button
                            key={run.id}
                            type="button"
                            onClick={() => setOpenRun(openRun?.id === run.id ? null : run)}
                            className="lp-run-link"
                          >
                            Briefing from {fmtDate(run.created_at)} ({run.sources.length} sources)
                          </button>
                        ))}
                      </div>
                    )}
                    {openRun && openRun.monitor_id === m.id && (
                      <div className="lp-report">
                        <div className="mb-2 flex flex-wrap justify-end gap-2">
                          <button type="button" className="lp-btn lp-btn-quiet lp-btn-sm" onClick={() => exportRun(openRun, "md")}>Markdown</button>
                          <button type="button" className="lp-btn lp-btn-quiet lp-btn-sm" onClick={() => exportRun(openRun, "pdf")}>PDF</button>
                        </div>
                        <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                          <Streamdown>{openRun.report}</Streamdown>
                        </div>
                      </div>
                    )}
                  </li>
                </Fragment>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
