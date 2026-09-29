import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SutaeruIcon } from "@/components/SutaeruIcon";

export const PROVIDERS = ["Gemini 3 Flash (Preview)"];

const t = trpc as any;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
      <h2 className="mb-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Status({ q, children }: { q: any; children: React.ReactNode }) {
  if (q.isLoading) return <div className="h-12 animate-pulse rounded-xl bg-muted/50" />;
  if (q.isError)
    return (
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>Couldn't load this right now.</span>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>Try again</Button>
      </div>
    );
  return <>{children}</>;
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="text-muted-foreground">{used} / {limit}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Settings() {
  const me = t.auth.me.useQuery(undefined, { retry: false });
  const quota = t.kemma.quota.useQuery(undefined, { retry: false });
  const models = t.kemma.availableModels.useQuery(undefined, { retry: false });
  const purge = t.kemma.hasPurgePassword.useQuery(undefined, { retry: false });
  const trial = t.kemma.activateTrial.useMutation({
    onSuccess: () => { toast.success("Trial started"); quota.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const setPw = t.kemma.setPurgePassword.useMutation({
    onSuccess: () => { toast.success("Purge password saved"); setPassword(""); purge.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const [password, setPassword] = useState("");

  const q = quota.data;

  return (
    <div className="sutaeru-editorial-page mx-auto max-w-3xl space-y-4 px-3 py-6 sm:px-4 sm:py-8">
      <h1 className="mb-2 text-2xl font-semibold text-foreground">Settings</h1>

      <Section title="Account">
        <Status q={me}>
          {me.data ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">{me.data.name || me.data.email || "Signed in"}</p>
                {me.data.email && <p className="text-sm text-muted-foreground">{me.data.email}</p>}
              </div>
              <Button variant="outline" size="sm" asChild><Link href="/identity">Edit profile</Link></Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">You're browsing as a guest — sign in to manage your account.</p>
          )}
        </Status>
      </Section>

      <Section title="Plan and usage">
        <Status q={quota}>
          {q ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-foreground">
                  <span className="font-semibold capitalize">{q.tier}</span> plan
                  {q.trial && <span className="text-muted-foreground"> · {q.trial.daysLeft} days left</span>}
                </p>
                {q.tier === "free" && (
                  <Button size="sm" disabled={trial.isPending} onClick={() => trial.mutate()}>
                    {trial.isPending ? "Starting…" : "Start free trial"}
                  </Button>
                )}
              </div>
              <Meter label="Messages today" used={q.messages.used} limit={q.messages.limit} />
              <Meter label="Tasks this month" used={q.tasks.used} limit={q.tasks.limit} />
              <Meter label="Think today" used={q.think.used} limit={q.think.limit} />
              <Meter label="Voice minutes this month" used={q.voice.used} limit={q.voice.limit} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No usage yet.</p>
          )}
        </Status>
      </Section>

      <Section title="Models">
        <Status q={models}>
          {models.data?.length ? (
            <ul className="divide-y divide-border">
              {models.data.map((m: any) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-foreground">
                    <SutaeruIcon name="models" className="h-4 w-4" />{m.label}
                  </span>
                  <span className={m.hasKey ? "text-foreground" : "text-muted-foreground"}>
                    {m.hasKey ? "Ready" : "Not configured"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No models available.</p>
          )}
        </Status>
      </Section>

      <Section title="Purge password">
        <Status q={purge}>
          <p className="mb-3 text-sm text-muted-foreground">
            {purge.data?.hasPassword ? "A purge password is set. Enter a new one to replace it." : "Set a password required before wiping your data."}
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); if (password.length >= 4) setPw.mutate({ password }); }}
          >
            <Input type="password" minLength={4} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 4 characters" />
            <Button type="submit" disabled={setPw.isPending || password.length < 4}>{setPw.isPending ? "Saving…" : "Save"}</Button>
          </form>
        </Status>
      </Section>

      <Section title="Connections">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">See which services are connected. Keys stay on the server.</p>
          <Button variant="outline" size="sm" asChild><Link href="/connections">Open</Link></Button>
        </div>
      </Section>
    </div>
  );
}
