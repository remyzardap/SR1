import { useState } from "react";
import { AlertCircle, Brain, Check, ChevronDown, Code2, FileText, Globe, HardDrive, Loader2, PenLine, Search, Sparkles, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActivitySource {
  title: string;
  url: string;
  host: string;
}

export interface ActivityItem {
  id: string;
  kind: "search" | "read" | "code" | "file" | "drive" | "skill" | "think" | "write" | "tool";
  status: "running" | "done" | "error";
  label: string;
  detail?: string;
  sources?: ActivitySource[];
  durationMs?: number;
}

const ICONS = {
  search: Search,
  read: Globe,
  code: Code2,
  file: FileText,
  drive: HardDrive,
  skill: Sparkles,
  think: Brain,
  write: PenLine,
  tool: Wrench,
} as const;

function seconds(ms?: number) {
  return ms == null ? "" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** Live timeline of what Kemma is doing: searches, pages read, tools, and the final write-up. */
export function ActivityFeed({ items, isRunning }: { items: ActivityItem[]; isRunning: boolean }) {
  const [open, setOpen] = useState(true);
  if (items.length === 0) return null;

  const steps = items.filter((item) => item.kind !== "think" || item.status === "running");
  const sourceCount = items.reduce((n, item) => n + (item.kind === "search" ? item.sources?.length ?? 0 : 0), 0);
  // While running always show the full feed; once finished it collapses to a one-line summary.
  const expanded = isRunning || open;

  return (
    <section className="sutaeru-activity my-3 text-sm" aria-label="What Kemma did" aria-live="polite">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground"
        onClick={() => setOpen((v) => !v)}
        disabled={isRunning}
      >
        {isRunning ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
        <span className="font-medium text-foreground">{isRunning ? "Working" : "Finished"}</span>
        <span className="truncate">
          {steps.length} step{steps.length === 1 ? "" : "s"}
          {sourceCount > 0 ? ` · ${sourceCount} sources` : ""}
        </span>
        {!isRunning && <ChevronDown className={cn("ml-auto size-4 transition-transform", expanded && "rotate-180")} aria-hidden="true" />}
      </button>
      {expanded && (
        <ol className="space-y-2 border-t px-3 py-3">
          {items.map((item) => {
            const Icon = ICONS[item.kind] ?? Wrench;
            return (
              <li key={item.id} className="flex items-start gap-2.5">
                <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                  item.status === "error" ? "text-destructive" : "text-muted-foreground")}>
                  {item.status === "running" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> :
                    item.status === "error" ? <AlertCircle className="size-4" aria-hidden="true" /> : <Icon className="size-4" aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("font-medium", item.status === "running" && "animate-pulse")}>{item.label}</span>
                    {item.durationMs != null && item.status !== "running" && <span className="text-xs text-muted-foreground">{seconds(item.durationMs)}</span>}
                  </div>
                  {item.detail && <p className="truncate text-xs text-muted-foreground">{item.detail}</p>}
                  {item.sources && item.sources.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {item.sources.map((source) => (
                        <a key={source.url} href={source.url} target="_blank" rel="noreferrer" title={source.title}
                          className="max-w-[11rem] truncate rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
                          {source.host || source.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
