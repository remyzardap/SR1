import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useIsMobile } from "@/hooks/useMobile";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { FocusBrackets, HalftoneRamp, SteppedMeter, Toggle } from "@/components/art";
import {
  readBackgroundArt,
  readReduceMotion,
  readThemeChoice,
  setBackgroundArt,
  setReduceMotion,
  setThemeChoice,
  type ThemeChoice,
} from "@/lib/theme";
import "@/styles/settings-reskin.css";

export const PROVIDERS = ["Gemini 3 Flash (Preview)"];

const t = trpc as any;

const TABS = [
  { id: "appearance", label: "Appearance" },
  { id: "account", label: "Account" },
  { id: "plan", label: "Plan and usage" },
  { id: "models", label: "Models" },
  { id: "purge", label: "Purge password" },
  { id: "connections", label: "Connections" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** The two rings of the logo mark, drawn small for the theme tiles. */
function ThemeMark({ className }: { className?: string }) {
  return (
    <svg className={className} width="44" height="30" viewBox="0 0 44 30" fill="none" aria-hidden="true">
      <circle cx="14" cy="15" r="11" stroke="currentColor" strokeWidth="3" />
      <circle cx="31" cy="15" r="11" stroke="currentColor" strokeWidth="3" />
      <circle cx="31" cy="15" r="4.2" className="sr-theme-dot" />
    </svg>
  );
}

const THEMES: Array<{ id: ThemeChoice; label: string }> = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

/** A theme option: an illustrated tile, bracketed when it is the current choice.
 *  The Light and Dark tiles always show their own palette (they illustrate the
 *  choice), so each one scopes the token layer with its own data-mode. */
function ThemeTile({ id, label, selected, onSelect }: { id: ThemeChoice; label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-mode={id === "system" ? undefined : id}
      className={`sr-theme-tile is-${id}${selected ? " is-selected" : ""}`}
      onClick={onSelect}
    >
      {selected && <FocusBrackets />}
      <span className="sr-theme-art" aria-hidden="true">
        {id === "system" ? <HalftoneRamp columns={5} rows={5} cell={11} maxRadius={3} /> : <ThemeMark className="sr-theme-mark" />}
      </span>
      <span className="sr-theme-label">{label}</span>
    </button>
  );
}

/** One setting row: a title, a one-line description and the switch. */
function SettingRow({ title, text, checked, onChange, label }: { title: string; text: string; checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <div className="sr-row">
      <div className="sr-row-copy">
        <p className="sr-row-title">{title}</p>
        <p className="sr-row-text">{text}</p>
      </div>
      <Toggle checked={checked} onCheckedChange={onChange} label={label} />
    </div>
  );
}

/** Appearance: the theme choice, motion and the background art. All three are real
 *  settings that write to <html> and persist in localStorage (see lib/theme.ts). */
function Appearance() {
  const [theme, setTheme] = useState<ThemeChoice>(() => readThemeChoice());
  const [motion, setMotion] = useState<boolean>(() => readReduceMotion());
  const [art, setArt] = useState<boolean>(() => readBackgroundArt());

  const chooseTheme = (next: ThemeChoice) => {
    setTheme(next);
    setThemeChoice(next);
  };
  const toggleMotion = (next: boolean) => {
    setMotion(next);
    setReduceMotion(next);
  };
  const toggleArt = (next: boolean) => {
    setArt(next);
    setBackgroundArt(next);
  };

  return (
    <>
      <Section title="Theme">
        <div className="sr-theme-grid" role="radiogroup" aria-label="Theme">
          {THEMES.map((item) => (
            <ThemeTile key={item.id} id={item.id} label={item.label} selected={theme === item.id} onSelect={() => chooseTheme(item.id)} />
          ))}
        </div>
      </Section>
      <Section title="Motion and art">
        <div className="sr-rows">
          <SettingRow
            title="Background art"
            text="Subtle wash and grain behind the workspace."
            checked={art}
            onChange={toggleArt}
            label="Background art"
          />
          <SettingRow
            title="Reduce motion"
            text="Turn off pulses and shimmers."
            checked={motion}
            onChange={toggleMotion}
            label="Reduce motion"
          />
        </div>
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="sk-card">
      <h2 className="sk-label">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Status({ q, children }: { q: any; children: React.ReactNode }) {
  if (q.isLoading) return <div className="sk-skeleton h-12 w-full" />;
  if (q.isError)
    return (
      <div className="sk-between">
        <p className="sk-empty-text m-0">Couldn't load this right now.</p>
        <button type="button" className="sk-btn sk-btn-sm shrink-0" onClick={() => q.refetch()}>
          Try again
        </button>
      </div>
    );
  return <>{children}</>;
}

/**
 * Two-factor sign-in. The setup key is held in component state only: it is shown on
 * screen, copied on request, and dropped as soon as setup is confirmed or cancelled.
 */
function TwoFactor() {
  const status = t.auth.get2faStatus.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const [setup, setSetup] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [turningOff, setTurningOff] = useState(false);

  const clear = () => {
    setSetup(null);
    setToken("");
    setError("");
    setTurningOff(false);
  };

  const start = t.auth.setup2fa.useMutation({
    onSuccess: (data: { qrDataUrl: string; secret: string }) => {
      setSetup(data);
      setToken("");
      setError("");
    },
    onError: (e: Error) => toast.error(e.message || "Could not start setup."),
  });
  const confirm = t.auth.verify2fa.useMutation({
    onSuccess: () => {
      clear();
      toast.success("Two-factor is on");
      // Write the new state straight into the query so the card flips to the on
      // state at once instead of showing "Turn on" until the refetch lands.
      utils.auth.get2faStatus.setData(undefined, (prev: any) => ({ ...prev, enabled: true }));
      void status.refetch();
    },
    onError: (e: Error) => setError(e.message || "That code did not work. Please try again."),
  });
  const off = t.auth.disable2fa.useMutation({
    onSuccess: () => {
      clear();
      toast.success("Two-factor is off");
      utils.auth.get2faStatus.setData(undefined, (prev: any) => ({ ...prev, enabled: false }));
      void status.refetch();
    },
    onError: (e: Error) => setError(e.message || "That code did not work. Please try again."),
  });

  const on = !!status.data?.enabled;
  const busy = start.isPending || confirm.isPending || off.isPending;

  const submitToken = () => {
    if (token.length !== 6 || busy) return;
    setError("");
    if (turningOff) off.mutate({ token });
    else confirm.mutate({ token });
  };

  const copyKey = async () => {
    const key = setup?.secret;
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      toast.success("Key copied");
    } catch {
      toast.error("Could not copy. Select the key and copy it by hand.");
    }
  };

  return (
    <Section title="Two-factor sign-in">
      <Status q={status}>
        <div className="flex flex-col gap-5">
          <div className="sr-row">
            <div className="sr-row-copy">
              <p className="sr-row-title">Two-factor sign-in</p>
              <p className="sr-row-text">
                {on
                  ? "On. Sign in needs your password and a 6 digit code."
                  : "Adds a 6 digit code from your authenticator app on top of your password."}
              </p>
            </div>
            <Toggle
              checked={on}
              disabled={busy}
              label="Two-factor sign-in"
              onCheckedChange={(next) => {
                setError("");
                if (next) start.mutate();
                else setTurningOff(true);
              }}
            />
          </div>

          {error && <p className="sk-error-text m-0" role="alert">{error}</p>}

          {setup && (
            <div className="flex flex-col items-center gap-5">
              <p className="sk-muted m-0 text-sm">Open your authenticator app, add Sutaeru, and scan this code.</p>
              <img
                src={setup.qrDataUrl}
                alt="Scan this code with your authenticator app"
                width={176}
                height={176}
                className="h-44 w-44 rounded-2xl bg-white shadow-[0_0_0_1px_#EFEEE8]"
              />
              <div className="flex w-full flex-col gap-2">
                <span className="sk-label">Can't scan? Enter this key</span>
                <div className="sk-between gap-3 rounded-2xl bg-[var(--sk-soft)] px-4 py-3">
                  <code className="min-w-0 break-all text-sm" style={{ font: "600 14px/1.6 var(--sk-mono)", userSelect: "all" }}>{setup.secret}</code>
                  <button type="button" className="sk-btn sk-btn-ghost shrink-0" onClick={() => void copyKey()}>Copy</button>
                </div>
              </div>
            </div>
          )}

          {(setup || turningOff) && (
            <form className="flex flex-wrap items-center gap-3" onSubmit={(e) => { e.preventDefault(); submitToken(); }}>
              <label className="sk-field min-w-0 flex-1">
                <span className="sk-label">{turningOff ? "Code to confirm" : "Authentication code"}</span>
                <input
                  data-testid={turningOff ? "input-2fa-disable-code" : "input-2fa-confirm-code"}
                  className="sk-input"
                  autoFocus
                  value={token}
                  onChange={(e) => { setToken(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                  inputMode="numeric"
                  autoComplete={setup ? "one-time-code" : "off"}
                  maxLength={6}
                  placeholder="000000"
                />
              </label>
              <button type="submit" className="sk-btn shrink-0" disabled={busy || token.length !== 6}>
                {busy ? "Working…" : turningOff ? "Turn off" : "Confirm"}
              </button>
              <button type="button" className="sk-btn sk-btn-ghost shrink-0" disabled={busy} onClick={clear}>
                Cancel
              </button>
            </form>
          )}

          {!setup && !turningOff && (
            on ? (
              <button type="button" className="sk-btn sk-btn-ghost self-start" onClick={() => { setError(""); setTurningOff(true); }}>
                Turn off
              </button>
            ) : (
              <button type="button" className="sk-btn self-start" disabled={busy} onClick={() => start.mutate()}>
                {busy ? "Working…" : "Turn on"}
              </button>
            )
          )}
        </div>
      </Status>
    </Section>
  );
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="sk-between">
        <span className="text-[15px] font-medium">{label}</span>
        <span className="sk-meta sk-num">{used} / {limit}</span>
      </div>
      <SteppedMeter value={ratio} segments={20} ariaLabel={`${label}: ${used} of ${limit}`} />
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
  const [tab, setTab] = useState<TabId>("appearance");
  // Phones get one scroll of cards (the canvas has no tab rail); desktop keeps the rail.
  const isMobile = useIsMobile();

  const q = quota.data;

  const sections: Record<TabId, React.ReactNode> = {
    appearance: <Appearance />,
    account: (
      <>
        <Section title="Account">
          <Status q={me}>
            {me.data ? (
              <div className="sk-between">
                <div className="sk-col">
                  <p className="sk-tile-title">{me.data.name || me.data.email || "Signed in"}</p>
                  {me.data.email && <p className="sk-muted m-0 text-sm">{me.data.email}</p>}
                </div>
                <Link href="/identity" className="sk-btn sk-btn-sm shrink-0">Edit profile</Link>
              </div>
            ) : (
              <p className="sk-empty-text m-0">Sign in to manage your account.</p>
            )}
          </Status>
        </Section>
        <TwoFactor />
      </>
    ),
    plan: (
      <Section title="Plan and usage">
        <Status q={quota}>
          {q ? (
            <div className="flex flex-col gap-6">
              <div className="sk-between">
                <p className="m-0 text-[17px] font-semibold">
                  <span className="capitalize">{q.tier}</span> plan
                  {q.trial && <span className="sk-muted font-normal"> · {q.trial.daysLeft} days left</span>}
                </p>
                {q.tier === "free" && (
                  <button
                    type="button"
                    className="sk-btn sk-btn-sm shrink-0"
                    disabled={trial.isPending}
                    onClick={() => trial.mutate()}
                  >
                    {trial.isPending ? "Starting…" : "Start free trial"}
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-5">
                <Meter label="Messages today" used={q.messages.used} limit={q.messages.limit} />
                <Meter label="Tasks this month" used={q.tasks.used} limit={q.tasks.limit} />
                <Meter label="Think today" used={q.think.used} limit={q.think.limit} />
                <Meter label="Voice minutes this month" used={q.voice.used} limit={q.voice.limit} />
              </div>
            </div>
          ) : (
            <p className="sk-empty-text m-0">No usage yet.</p>
          )}
        </Status>
      </Section>
    ),
    models: (
      <Section title="Models">
        <Status q={models}>
          {models.data?.length ? (
            <ul className="m-0 list-none p-0">
              {models.data.map((m: any, i: number) => (
                <li key={m.id}>
                  {i > 0 && <hr className="sk-hairline" />}
                  <div className="sk-between py-4">
                    <span className="flex min-w-0 items-center gap-3 text-[15px] font-semibold">
                      <SutaeruIcon name="models" className="h-4 w-4 shrink-0" />
                      <span className="break-words">{m.label}</span>
                    </span>
                    {m.hasKey ? (
                      <span className="sk-connected shrink-0">
                        <span className="sk-dot" aria-hidden="true" />
                        Ready
                      </span>
                    ) : (
                      <span className="sk-meta shrink-0">Not configured</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sk-empty-text m-0">No models available.</p>
          )}
        </Status>
      </Section>
    ),
    purge: (
      <Section title="Purge password">
        <Status q={purge}>
          <div className="flex flex-col gap-5">
            <p className="sk-muted m-0 text-sm">
              {purge.data?.hasPassword ? "A purge password is set. Enter a new one to replace it." : "Set a password required before wiping your data."}
            </p>
            <form
              className="flex flex-wrap items-center gap-3"
              onSubmit={(e) => { e.preventDefault(); if (password.length >= 4) setPw.mutate({ password }); }}
            >
              <input
                type="password"
                minLength={4}
                maxLength={128}
                className="sk-input min-w-0 flex-1"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 4 characters"
              />
              <button type="submit" className="sk-btn shrink-0" disabled={setPw.isPending || password.length < 4}>
                {setPw.isPending ? "Saving…" : "Save"}
              </button>
            </form>
          </div>
        </Status>
      </Section>
    ),
    connections: (
      <Section title="Connections">
        <div className="sk-between">
          <p className="sk-muted m-0 text-sm">See which services are connected. Keys stay on the server.</p>
          <Link href="/connections" className="sk-btn sk-btn-sm shrink-0">Open</Link>
        </div>
      </Section>
    ),
  };

  return (
    <div className="sk-page sr-settings">
      <header className="sk-header">
        <div>
          <h1 className="sk-h1">Settings</h1>
          <p className="sk-sub">Make Sutaeru feel like yours.</p>
        </div>
      </header>

      {isMobile ? (
        <div className="sk-stack">
          {TABS.map((item) => (
            <div key={item.id} className="contents">{sections[item.id]}</div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-7 md:grid-cols-[220px_minmax(0,1fr)] md:max-w-5xl">
          <nav aria-label="Settings sections" className="sk-tabs">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="sk-tab"
                aria-pressed={tab === item.id}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="min-w-0">
            <div className="sk-stack">{sections[tab]}</div>
          </div>
        </div>
      )}
    </div>
  );
}

