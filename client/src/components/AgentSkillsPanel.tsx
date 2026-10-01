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
    return (
      <div className="sk-card mb-7" aria-label="Loading skill folders">
        <div className="sk-skeleton h-16" />
      </div>
    );
  }
  if (list.isError || !list.data || list.data.length === 0) return null;

  return (
    <section className="sk-card mb-7">
      <header className="mb-4 flex items-start gap-4">
        <span className="sk-icon-tile mt-0.5">
          <SutaeruIcon name="review" />
        </span>
        <div className="min-w-0">
          <p className="sk-label">Owner only</p>
          <h2 className="m-0 mt-1 text-lg font-semibold">Skill folders</h2>
          <p className="mt-1 mb-0 max-w-2xl text-sm leading-relaxed sk-muted">
            Kemma only uses a skill after you review it and switch it on. Editing a skill file switches it off until you review it again.
          </p>
        </div>
      </header>

      <ul className="m-0 list-none divide-y divide-[#EFEEE8] p-0">
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
                    <span className="truncate font-semibold">{s.slug}</span>
                    <span className={"sk-chip " + (on ? "sk-chip-running" : "sk-chip-idle")}>
                      <span className="sk-dot" />
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                    {s.changedSinceApproval && (
                      <span className="text-xs sk-muted">changed since last approval</span>
                    )}
                  </div>
                  <p className="mt-1 mb-0 line-clamp-2 text-sm sk-muted">{s.description}</p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {s.report && (
                    <Button variant="ghost" size="sm" onClick={() => setOpen(isOpen ? null : s.slug)} className="sk-btn sk-btn-sm sk-btn-ghost">
                      <SutaeruIcon name="report" className="mr-1.5 h-4 w-4" />
                      {isOpen ? "Hide report" : "Report"}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => review.mutate({ slug: s.slug })} className="sk-btn sk-btn-sm sk-btn-ghost">
                    {reviewing ? "Reviewing…" : s.status === "unreviewed" ? "Review" : "Review again"}
                  </Button>
                  <button
                    type="button"
                    className={"sk-toggle" + (on ? " is-on" : "")}
                    aria-pressed={on}
                    aria-label={on ? "Turn off" : "Turn on"}
                    disabled={busy || (!on && (s.status === "unreviewed" || s.status === "rejected"))}
                    onClick={() => toggle.mutate({ slug: s.slug, enabled: !on })}
                  />
                </div>
              </div>

              {isOpen && s.report && (
                <div className="mt-4 space-y-3 rounded-[20px] bg-[#F7F6F2] p-5 text-sm">
                  <p className="m-0">{s.report.summary}</p>
                  <dl className="grid gap-2 sk-muted sm:grid-cols-2">
                    <div><dt className="sk-label">Verdict</dt><dd className="m-0">{s.verdict}</dd></div>
                    <div><dt className="sk-label">Files</dt><dd className="m-0">{s.files.length}{s.report.hasScripts ? " (includes scripts, sandbox only)" : ""}</dd></div>
                    <div className="sm:col-span-2"><dt className="sk-label">Tools it asks for</dt><dd className="m-0">{s.report.requestedTools.join(", ") || "none"}</dd></div>
                    {s.report.ruleOverrideAttempts.length > 0 && (
                      <div className="sm:col-span-2"><dt className="sk-label">Rule override attempts</dt><dd className="m-0">{s.report.ruleOverrideAttempts.join("; ")}</dd></div>
                    )}
                  </dl>
                  {s.report.notes.length > 0 && (
                    <ul className="m-0 list-disc space-y-1 pl-5 sk-muted">
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
