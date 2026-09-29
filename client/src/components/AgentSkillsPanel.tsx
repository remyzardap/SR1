import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { Button } from "@/components/ui/button";

const STATUS_LABEL: Record<string, string> = {
  unreviewed: "Not reviewed",
  reviewed: "Reviewed, off",
  enabled: "On",
  rejected: "Rejected",
};

export function AgentSkillsPanel() {
  const utils = (trpc as any).useUtils();
  const list = (trpc as any).kemma.agentSkills.useQuery(undefined, { retry: false });
  const [open, setOpen] = useState<string | null>(null);

  const refresh = () => utils.kemma.agentSkills.invalidate();
  const review = (trpc as any).kemma.reviewAgentSkill.useMutation({
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = (trpc as any).kemma.setAgentSkillEnabled.useMutation({
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  // Owner-only: hide for non-admins and when the server has no skill folders.
  if (list.isLoading) {
    return <div className="mb-6 h-20 animate-pulse rounded-2xl border border-border bg-muted/40" aria-label="Loading skill folders" />;
  }
  if (list.isError || !list.data || list.data.length === 0) return null;

  return (
    <section className="mb-8 rounded-2xl border border-border bg-card p-4 sm:p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
          <SutaeruIcon name="review" className="h-5 w-5 text-foreground" />
        </span>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Owner only</p>
          <h2 className="text-lg font-semibold text-foreground">Skill folders</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Kemma only uses a skill after you review it and switch it on. Editing a skill file switches it off until you review it again.
          </p>
        </div>
      </header>

      <ul className="divide-y divide-border">
        {list.data.map((s: any) => {
          const reviewing = review.isPending && review.variables?.slug === s.slug;
          const busy = reviewing || (toggle.isPending && toggle.variables?.slug === s.slug);
          const isOpen = open === s.slug;
          const on = s.status === "enabled";
          return (
            <li key={s.slug} className="py-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-foreground">{s.slug}</span>
                    <span
                      className={
                        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs " +
                        (on ? "border-primary/40 text-foreground" : "border-border text-muted-foreground")
                      }
                    >
                      <span className={"h-1.5 w-1.5 rounded-full " + (on ? "bg-primary" : "bg-muted-foreground/50")} />
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                    {s.changedSinceApproval && (
                      <span className="text-xs text-muted-foreground">changed since last approval</span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{s.description}</p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {s.report && (
                    <Button variant="ghost" size="sm" onClick={() => setOpen(isOpen ? null : s.slug)}>
                      <SutaeruIcon name="report" className="mr-1.5 h-4 w-4" />
                      {isOpen ? "Hide report" : "Report"}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => review.mutate({ slug: s.slug })}>
                    {reviewing ? "Reviewing…" : s.status === "unreviewed" ? "Review" : "Review again"}
                  </Button>
                  {on ? (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => toggle.mutate({ slug: s.slug, enabled: false })}>
                      Turn off
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={busy || s.status === "unreviewed" || s.status === "rejected"}
                      onClick={() => toggle.mutate({ slug: s.slug, enabled: true })}
                    >
                      Turn on
                    </Button>
                  )}
                </div>
              </div>

              {isOpen && s.report && (
                <div className="mt-4 space-y-3 rounded-xl border border-border bg-background p-4 text-sm">
                  <p className="text-foreground">{s.report.summary}</p>
                  <dl className="grid gap-2 text-muted-foreground sm:grid-cols-2">
                    <div><dt className="text-[11px] uppercase tracking-[0.14em]">Verdict</dt><dd className="text-foreground">{s.verdict}</dd></div>
                    <div><dt className="text-[11px] uppercase tracking-[0.14em]">Files</dt><dd className="text-foreground">{s.files.length}{s.report.hasScripts ? " (includes scripts, sandbox only)" : ""}</dd></div>
                    <div className="sm:col-span-2"><dt className="text-[11px] uppercase tracking-[0.14em]">Tools it asks for</dt><dd className="text-foreground">{s.report.requestedTools.join(", ") || "none"}</dd></div>
                    {s.report.ruleOverrideAttempts.length > 0 && (
                      <div className="sm:col-span-2"><dt className="text-[11px] uppercase tracking-[0.14em] text-destructive">Rule override attempts</dt><dd className="text-foreground">{s.report.ruleOverrideAttempts.join("; ")}</dd></div>
                    )}
                  </dl>
                  {s.report.notes.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                      {s.report.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
