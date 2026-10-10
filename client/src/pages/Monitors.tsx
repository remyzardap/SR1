/**
 * Monitors — the container, on the shared list pattern.
 *
 * The three numbers are one strip, the new-monitor form and the watched topics are folds,
 * and each briefing a monitor filed opens inside its own row instead of pushing the page out.
 */
import { Fragment, useCallback, useEffect, useState } from "react";
import { Streamdown } from "streamdown";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { callFunction } from "@/lib/kemmaCloud";
import { downloadResearchMarkdown, downloadResearchPdf } from "@/lib/researchReports";
import { toast } from "sonner";
import { Chip, SteppedMeter, StatusPill, type StatusPillStatus } from "@/components/art";
import { ListEmpty, ListFold, ListFolds, ListPage, Row, Rows, RowsSkeleton, StatStrip, useListFolds } from "@/components/list";
import { pickArt } from "@/lib/pickArt";
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
const FOLD_IDS = ["new", "watching"];

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

  // A page with nothing to look at opens on the form; once there are topics it opens on them.
  const folds = useListFolds("monitors", FOLD_IDS, { first: monitors.length === 0 ? "new" : "watching" });

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

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (topic.trim().length < 5 || creating) return;
    setCreating(true);
    try {
      await callFunction("monitors", { action: "create", topic: topic.trim(), frequency });
      setTopic("");
      toast.success("Monitor created — the first briefing runs shortly.");
      await load();
      folds.setOpen("watching", true);
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
    <ListPage
      title="Monitors"
      lede="Sutaeru re-investigates your topics on a schedule and files a fresh cited briefing each run."
      fold={folds}
    >
      {monitors.length > 0 && (
        <StatStrip
          items={[
            { label: "Active", value: activeCount, meter: monitors.length ? activeCount / monitors.length : 0, meterLabel: `${activeCount} of ${monitors.length} running` },
            { label: "Runs today", value: runsToday },
            { label: "Next", value: nextRunLabel },
          ]}
        />
      )}

      <ListFolds fold={folds}>
        <ListFold
          id="new"
          index={1}
          fold={folds}
          label="New monitor"
          pick={frequency === "daily" ? "Every day" : "Every week"}
          mini={pickArt("out-monitor")}
        >
          <div className="lp-field-group">
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
            <button type="button" className="lp-btn lp-btn-self" onClick={() => void create()} disabled={creating || topic.trim().length < 5}>
              {creating ? "Adding..." : "Add monitor"}
            </button>
          </div>
        </ListFold>

        <ListFold
          id="watching"
          index={2}
          fold={folds}
          label="Watching"
          pick={loading ? "Checking" : monitors.length === 0 ? "Nothing yet" : `${activeCount} of ${monitors.length} running`}
          mini={pickArt("depth-standard")}
        >
          {loading && <RowsSkeleton rows={3} />}

          {error && (
            <div className="lst-empty">
              <p className="mono" style={{ color: "var(--r-alert)" }}>
                Error
              </p>
              <p className="lst-body">{error}</p>
              <button type="button" className="btn" onClick={() => void load()}>
                Try again
              </button>
            </div>
          )}

          {!loading && !error && monitors.length === 0 && (
            <ListEmpty title="Nothing watched yet." text="Add a topic above and Sutaeru will keep an eye on it." icon="schedule" />
          )}

          {monitors.length > 0 && (
            <Rows label="Monitors">
              {monitors.map((m) => {
                const monitorRuns = runs.filter((r) => r.monitor_id === m.id);
                const status = monitorStatus(m, now);
                const days = activeDays(monitorRuns, now);
                return (
                  <Row
                    key={m.id}
                    title={m.topic}
                    meta={`${scheduleLabel(m)} · ${days} of the last ${ACTIVITY_DAYS} days briefed`}
                    quiet={!m.active}
                    status={<StatusPill status={status} />}
                    actions={
                      <>
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
                      </>
                    }
                  >
                    <div className="lp-mon-activity">
                      <SteppedMeter
                        value={days / ACTIVITY_DAYS}
                        segments={ACTIVITY_DAYS}
                        variant="col"
                        ariaLabel={`${days} of the last ${ACTIVITY_DAYS} days with a briefing`}
                      />
                    </div>
                    {monitorRuns.length > 0 && (
                      <div className="lp-mon-runs">
                        <hr className="lp-hairline" />
                        {monitorRuns.slice(0, 3).map((run) => (
                          <Fragment key={run.id}>
                            <button
                              type="button"
                              onClick={() => setOpenRun(openRun?.id === run.id ? null : run)}
                              className="lp-run-link"
                            >
                              Briefing from {fmtDate(run.created_at)} ({run.sources.length} sources)
                            </button>
                            {openRun?.id === run.id && (
                              <div className="lp-report">
                                <div className="mb-2 flex flex-wrap justify-end gap-2">
                                  <button type="button" className="lp-btn lp-btn-quiet lp-btn-sm" onClick={() => exportRun(run, "md")}>
                                    Markdown
                                  </button>
                                  <button type="button" className="lp-btn lp-btn-quiet lp-btn-sm" onClick={() => exportRun(run, "pdf")}>
                                    PDF
                                  </button>
                                </div>
                                <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                                  <Streamdown>{run.report}</Streamdown>
                                </div>
                              </div>
                            )}
                          </Fragment>
                        ))}
                      </div>
                    )}
                  </Row>
                );
              })}
            </Rows>
          )}
        </ListFold>
      </ListFolds>
    </ListPage>
  );
}
