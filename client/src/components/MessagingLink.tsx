import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { getAuthToken } from "@/lib/authSession";
import SutaeruIcon from "@/components/SutaeruIcon";

interface Status {
  whatsapp: {
    enabled: boolean;
    state: "off" | "waiting" | "connecting" | "open";
    pairingCode?: string;
    number?: string;
    note?: string;
    pairNumberEnding?: string;
  };
  telegram: { botTokenSet: boolean; webhookSecretSet: boolean; connected: boolean; allowedUsers: number };
}

const BASE = `${import.meta.env.VITE_SR1_API_ORIGIN || ""}/api/admin/messaging`;

async function call<T>(path: string, body?: unknown): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status}).`);
  return data as T;
}

/** Owner-only: link WhatsApp with a pairing code and see whether Telegram is connected. */
export default function MessagingCard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setStatus(await call<Status>("/status"));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the messaging status.");
    }
  }, []);

  // Poll while a link is in progress, then slow down once it is linked.
  const state = status?.whatsapp.state;
  useEffect(() => {
    if (!isAdmin) return;
    void refresh();
    const every = state === "open" || state === "off" ? 15000 : 3000;
    timer.current = window.setInterval(() => void refresh(), every);
    return () => window.clearInterval(timer.current);
  }, [isAdmin, state, refresh]);

  if (!isAdmin) return null;

  async function link() {
    if (busy) return;
    setBusy(true);
    try {
      const next = await call<Status & { started: boolean }>("/link", { number });
      setStatus(next);
      setChanging(false);
      toast.success(next.started ? "Getting a pairing code..." : "Number saved. The next code uses it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start linking.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Code copied");
    } catch {
      toast.error("Could not copy. Select the code and copy it by hand.");
    }
  }

  const wa = status?.whatsapp;
  const showForm = !!wa && (wa.state === "off" || changing);

  return (
    <>
      <section className="sk-card sk-col" style={{ marginBottom: 28, gap: 18 }} data-testid="card-whatsapp">
        <div className="sk-between">
          <div className="sk-row" style={{ gap: 14 }}>
            <span className="sk-icon-tile"><SutaeruIcon name="ask" /></span>
            <div className="sk-col" style={{ gap: 2 }}>
              <h2 className="sk-tile-title">WhatsApp</h2>
              <p className="sk-muted" style={{ margin: 0 }}>
                {wa?.state === "open" ? `Linked as +${wa.number ?? "your number"}` : "Chat with Sutaeru from WhatsApp"}
              </p>
            </div>
          </div>
          {wa?.state === "open" ? (
            <span className="sk-connected"><span className="sk-dot" />Linked</span>
          ) : (
            <span className="sk-label" style={{ whiteSpace: "nowrap" }}>{wa?.state === "waiting" ? "Waiting for you" : wa?.state === "connecting" ? "Connecting" : "Not linked"}</span>
          )}
        </div>

        {error && <p className="sk-muted" role="alert" style={{ margin: 0 }}>{error}</p>}
        {!status && !error && <p className="sk-muted" style={{ margin: 0 }}><Loader2 className="inline h-4 w-4 animate-spin" /> Loading...</p>}

        {wa?.state === "open" && (
          <p className="sk-muted" style={{ margin: 0 }}>
            Open the chat with yourself in WhatsApp (Message yourself) and write to Sutaeru there. Other numbers are ignored unless they are on the allowed list.
          </p>
        )}

        {wa?.state === "waiting" && wa.pairingCode && (
          <div className="sk-col" style={{ gap: 14 }}>
            <div className="sk-row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span
                className="sk-num"
                aria-label={`Pairing code ${wa.pairingCode.split("").join(" ")}`}
                style={{ font: "600 34px/1 var(--font-m, 'JetBrains Mono'), monospace", letterSpacing: "0.22em", userSelect: "all" }}
                data-testid="text-pairing-code"
              >
                {wa.pairingCode}
              </span>
              <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => void copyCode(wa.pairingCode!)}>Copy</button>
            </div>
            <ol className="sk-muted" style={{ margin: 0, paddingLeft: 22, display: "grid", gap: 4, listStyleType: "decimal" }}>
              <li>Open WhatsApp on the phone with this number{wa.pairNumberEnding ? ` (ending ${wa.pairNumberEnding})` : ""}.</li>
              <li>Go to Settings, then Linked devices, then Link a device.</li>
              <li>Choose Link with phone number instead, and type the code above.</li>
            </ol>
            <p className="sk-muted" style={{ margin: 0 }}>The code runs out after a short while. A new one appears here by itself.</p>
          </div>
        )}

        {wa?.state === "connecting" && (
          <p className="sk-muted" style={{ margin: 0 }}><Loader2 className="inline h-4 w-4 animate-spin" /> Getting a pairing code...</p>
        )}

        {wa?.note && wa.state !== "open" && <p className="sk-muted" style={{ margin: 0 }}>{wa.note}</p>}

        {showForm && (
          <div className="sk-col" style={{ gap: 10 }}>
            <label className="sk-field">
              <span className="sk-label">Phone number to link</span>
              <input
                id="wa-number"
                className="sk-input"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+62 812 3456 7890"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void link(); }}
              />
            </label>
            <p className="sk-muted" style={{ margin: 0 }}>Use a spare number if you can. Linking a bot is against WhatsApp's terms and can get a number restricted. Include the country code.</p>
            <div className="sk-row" style={{ gap: 8 }}>
              <button type="button" className="sk-btn" onClick={() => void link()} disabled={busy || number.trim().length < 8}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Get pairing code
              </button>
              {changing && <button type="button" className="sk-btn sk-btn-ghost" onClick={() => setChanging(false)}>Cancel</button>}
            </div>
          </div>
        )}

        {wa && (wa.state === "waiting" || wa.state === "connecting") && !changing && (
          <div>
            <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setChanging(true)}>Use a different number</button>
          </div>
        )}
      </section>

      <section className="sk-card sk-col" style={{ marginBottom: 28, gap: 14 }} data-testid="card-telegram">
        <div className="sk-between">
          <div className="sk-row" style={{ gap: 14 }}>
            <span className="sk-icon-tile"><SutaeruIcon name="connections" /></span>
            <div className="sk-col" style={{ gap: 2 }}>
              <h2 className="sk-tile-title">Telegram</h2>
              <p className="sk-muted" style={{ margin: 0 }}>Chat with Sutaeru from a Telegram bot</p>
            </div>
          </div>
          {status?.telegram.connected ? (
            <span className="sk-connected"><span className="sk-dot" />Connected</span>
          ) : (
            <span className="sk-label">Not connected</span>
          )}
        </div>
        {status && !status.telegram.connected && (
          <ol className="sk-muted" style={{ margin: 0, paddingLeft: 22, display: "grid", gap: 4, listStyleType: "decimal" }}>
            <li>In Telegram, message @BotFather, send /newbot and follow the steps.</li>
            <li>Put the token it gives you in the server setting TELEGRAM_BOT_TOKEN.</li>
            <li>Add your own numeric Telegram id to TELEGRAM_ALLOWED_USER_IDS (the bot ignores everyone else).</li>
          </ol>
        )}
        {status?.telegram.connected && (
          <p className="sk-muted" style={{ margin: 0 }}>
            {status.telegram.allowedUsers > 0
              ? `${status.telegram.allowedUsers} ${status.telegram.allowedUsers === 1 ? "person is" : "people are"} allowed to talk to the bot. Everyone else is ignored.`
              : "Nobody is allowed yet, so the bot ignores everyone. Add your numeric Telegram id to TELEGRAM_ALLOWED_USER_IDS."}
          </p>
        )}
      </section>
    </>
  );
}
