import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, string> = {
  unreviewed: "Not reviewed",
  reviewed: "Reviewed, off",
  enabled: "On",
  rejected: "Rejected",
};

export function AgentSkillsPanel() {
  const utils = trpc.useUtils();
  const list = trpc.kemma.agentSkills.useQuery(undefined, { retry: false });
  const [open, setOpen] = useState<string | null>(null);

  const refresh = () => utils.kemma.agentSkills.invalidate();
  const review = trpc.kemma.reviewAgentSkill.useMutation({
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const toggle = trpc.kemma.setAgentSkillEnabled.useMutation({
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });

  // Owner-only: hide for non-admins and when the server has no skill folders.
  if (list.isError || !list.data || list.data.length === 0) return null;

  return (
    <section className="glass-card p-4 sm:p-5 mb-4">
      <div className="mb-3">
        <h2 className="text-base font-semibold" style={{ color: "var(--foreground)" }}>
          Skill folders
        </h2>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Kemma only uses a skill after you review and switch it on. Editing a skill file switches it off until you review it again.
        </p>
      </div>

      <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
        {list.data.map((s) => {
          const busy = (review.isPending && review.variables?.slug === s.slug) || (toggle.isPending && toggle.variables?.slug === s.slug);
          const isOpen = open === s.slug;
          return (
            <li key={s.slug} className="py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate" style={{ color: "var(--foreground)" }}>{s.slug}</span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ border: "1px solid var(--border)", color: s.status === "enabled" ? "var(--foreground)" : "var(--muted-foreground)" }}
                    >
                      {STATUS_LABEL[s.status]}
                    </span>
                    {s.changedSinceApproval && (
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>changed since last approval</span>
                    )}
                  </div>
                  <p className="text-sm line-clamp-2" style={{ color: "var(--muted-foreground)" }}>{s.description}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {s.report && (
                    <button className="text-sm underline underline-offset-2" style={{ color: "var(--muted-foreground)" }} onClick={() => setOpen(isOpen ? null : s.slug)}>
                      {isOpen ? "Hide report" : "Report"}
                    </button>
                  )}
                  <button className="glass rounded-full px-3 py-1.5 text-sm" disabled={busy} onClick={() => review.mutate({ slug: s.slug })}>
                    {review.isPending && review.variables?.slug === s.slug ? "Reviewing..." : s.status === "unreviewed" ? "Review" : "Review again"}
                  </button>
                  {s.status === "enabled" ? (
                    <button className="glass rounded-full px-3 py-1.5 text-sm" disabled={busy} onClick={() => toggle.mutate({ slug: s.slug, enabled: false })}>
                      Turn off
                    </button>
                  ) : (
                    <button
                      className="btn-primary-teal px-3 py-1.5 text-sm"
                      disabled={busy || s.status === "unreviewed" || s.status === "rejected"}
                      onClick={() => toggle.mutate({ slug: s.slug, enabled: true })}
                    >
                      Turn on
                    </button>
                  )}
                </div>
              </div>

              {isOpen && s.report && (
                <div className="mt-3 text-sm space-y-2" style={{ color: "var(--foreground)" }}>
                  <p>{s.report.summary}</p>
                  <dl className="grid gap-1" style={{ color: "var(--muted-foreground)" }}>
                    <div><dt className="inline font-medium">Verdict: </dt><dd className="inline">{s.verdict}</dd></div>
                    <div><dt className="inline font-medium">Tools it asks for: </dt><dd className="inline">{s.report.requestedTools.join(", ") || "none"}</dd></div>
                    <div><dt className="inline font-medium">Files: </dt><dd className="inline">{s.files.length}{s.report.hasScripts ? " (includes scripts, sandbox only)" : ""}</dd></div>
                    {s.report.ruleOverrideAttempts.length > 0 && (
                      <div><dt className="inline font-medium">Rule override attempts: </dt><dd className="inline">{s.report.ruleOverrideAttempts.join("; ")}</dd></div>
                    )}
                    {s.report.notes.map((n, i) => <div key={i}>{n}</div>)}
                  </dl>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
