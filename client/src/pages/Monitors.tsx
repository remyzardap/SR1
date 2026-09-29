import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Loader2, Pause, Play, Plus, Radar, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Streamdown } from "streamdown";
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
  if (!iso) return "—";
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

  return (
    <div className="sutaeru-editorial-page mx-auto max-w-3xl px-3 py-6 sm:px-4 sm:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <Radar className="size-5" aria-hidden="true" /> Research on autopilot
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kemma re-investigates your topics on a schedule and files a fresh cited briefing each run.
        </p>
      </header>

      {/* New monitor */}
      <div className="glass-card mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void create()}
          placeholder="e.g. Indonesian nickel export policy changes"
          className="input-glass w-full flex-1 px-3 py-2.5 text-sm outline-none"
          aria-label="Topic to monitor"
        />
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-border p-0.5" role="group" aria-label="Frequency">
            {(["daily", "weekly"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFrequency(f)}
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-colors ${frequency === f ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {f}
              </button>
            ))}
          </div>
          <Button onClick={() => void create()} disabled={creating || topic.trim().length < 5} className="gap-1.5">
            {creating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />} Monitor
          </Button>
        </div>
      </div>

      {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading monitors…</p>}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <p>{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void load()}>Try again</Button>
        </div>
      )}

      {!loading && !error && monitors.length === 0 && (
        <p className="py-16 text-center text-sm text-muted-foreground">No monitors yet — add a topic above and Kemma will keep an eye on it.</p>
      )}

      <div className="flex flex-col gap-3">
        {monitors.map((m) => {
          const monitorRuns = runs.filter((r) => r.monitor_id === m.id);
          return (
            <div key={m.id} className="glass-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{m.topic}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarClock className="size-3.5" aria-hidden="true" />
                    {m.frequency} · {m.active ? `next run ${fmtDate(m.next_run_at)}` : "paused"} · last run {fmtDate(m.last_run_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => void toggle(m)} aria-label={m.active ? "Pause monitor" : "Resume monitor"} title={m.active ? "Pause" : "Resume"}>
                    {m.active ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => void remove(m)} aria-label="Delete monitor" title="Delete">
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
              {monitorRuns.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
                  {monitorRuns.slice(0, 3).map((run) => (
                    <button
                      key={run.id}
                      onClick={() => setOpenRun(openRun?.id === run.id ? null : run)}
                      className="text-left text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      Briefing from {fmtDate(run.created_at)} ({run.sources.length} sources)
                    </button>
                  ))}
                </div>
              )}
              {openRun && openRun.monitor_id === m.id && (
                <div className="mt-3 rounded-md border border-border p-3">
                  <div className="mb-2 flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => exportRun(openRun, "md")}>Markdown</Button>
                    <Button variant="ghost" size="sm" onClick={() => exportRun(openRun, "pdf")}>PDF</Button>
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                    <Streamdown>{openRun.report}</Streamdown>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
