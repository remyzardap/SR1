/**
 * Connections — the container, on the shared list pattern.
 *
 * Four folds: Google Workspace, the messaging links, the services you added yourself, and
 * the form that adds one. Each folded header says what is behind it, so the phone opens on
 * one thing at a time instead of five cards at once. Everything the page did before still
 * works — the OAuth round trip, connect/disconnect, add, revoke, and the same test ids.
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useSearch } from "wouter";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { format } from "date-fns";
import SutaeruIcon from "@/components/SutaeruIcon";
import { HalftoneRamp, StatusPill } from "@/components/art";
import MessagingCard from "@/components/MessagingLink";
import { ListEmpty, ListFold, ListFolds, ListPage, Row, Rows, RowsSkeleton, SearchBar, useAutoOpen, useListFolds } from "@/components/list";
import { PickTiles, type PickItem } from "@/components/fold";
import { pickArt } from "@/lib/pickArt";
import "@/styles/connections.css";

const connectionTypeLabels = {
  llm_api_key: "LLM API Key",
  oauth2: "OAuth 2.0",
  generic_api_key: "API Key",
};

// Status pills follow the canvas: active = live, the rest read as inactive.
const statusConfig = {
  active: { label: "Active", pill: "live" as const },
  revoked: { label: "Revoked", pill: "paused" as const },
  expired: { label: "Expired", pill: "failed" as const },
};

const CONNECTION_TYPES: Array<{ value: "llm_api_key" | "oauth2" | "generic_api_key"; label: string }> = [
  { value: "generic_api_key", label: "API Key" },
  { value: "oauth2", label: "OAuth 2.0" },
  { value: "llm_api_key", label: "LLM API Key" },
];

/** The picture each kind of credential is shown with in the add form. */
const TYPE_TILES: PickItem[] = [
  { id: "generic_api_key", label: "API Key", art: pickArt("src-files") },
  { id: "oauth2", label: "OAuth 2.0", art: pickArt("src-drive") },
  { id: "llm_api_key", label: "LLM API Key", art: pickArt("model-best") },
];

const FOLD_IDS = ["google", "messaging", "linked", "add", "privacy"];

function GoogleWorkspace({ onState }: { onState(next: string): void }) {
  const utils = trpc.useUtils();
  const { data: configured } = trpc.google.configured.useQuery();
  const { data: status, isLoading: statusLoading } = trpc.google.status.useQuery(undefined, {
    enabled: !!configured?.configured,
  });
  const { data: authUrlData } = trpc.google.getAuthUrl.useQuery(undefined, {
    enabled: !!configured?.configured && !status?.connected,
  });

  const disconnectMutation = trpc.google.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Google account disconnected");
      utils.google.status.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (!configured) return;
    onState(configured.configured ? (status?.connected ? "connected" : "ready") : "off");
  }, [configured, status, onState]);

  if (!configured?.configured) {
    return (
      <div data-testid="card-google-not-configured">
        <Row
          title="Google Workspace"
          initials="G"
          body="Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Gmail, Calendar & Drive"
          meta="OAUTH 2 · NOT CONFIGURED"
          status={<span className="tag quiet">Not Configured</span>}
        />
      </div>
    );
  }

  return (
    <div data-testid="card-google-workspace">
    <Rows label="Google Workspace">
      <Row
        title="Google Workspace"
        initials="G"
        meta={status?.connected ? `CONNECTED AS ${status.email}` : "CONNECT GMAIL, CALENDAR & DRIVE TO SUTAERU"}
        status={status?.connected ? <StatusPill status="live" /> : <span className="tag quiet">Disconnected</span>}
        actions={
          status?.connected ? (
            <button
              type="button"
              className="btn ghost"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              data-testid="button-disconnect-google"
            >
              {disconnectMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (authUrlData?.url) window.location.href = authUrlData.url;
              }}
              disabled={statusLoading || !authUrlData?.url}
              data-testid="button-connect-google"
            >
              {statusLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Connect Google Account
            </button>
          )
        }
      >
        <div className="row wrap">
          <span className="sk-chip">Gmail</span>
          <span className="sk-chip">Calendar</span>
          <span className="sk-chip">Drive</span>
        </div>
      </Row>
    </Rows>
    </div>
  );
}

export default function Connections() {
  const utils = trpc.useUtils();
  const searchString = useSearch();
  const [isAdding, setIsAdding] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [googleState, setGoogleState] = useState("checking");

  const [provider, setProvider] = useState("");
  const [type, setType] = useState<"llm_api_key" | "oauth2" | "generic_api_key">("generic_api_key");
  const [displayName, setDisplayName] = useState("");
  const [credentials, setCredentials] = useState("");
  const [query, setQuery] = useState("");

  const fold = useListFolds("connections", FOLD_IDS, { first: "google" });
  useAutoOpen(fold, "add", isAdding);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const googleResult = params.get("google");
    if (googleResult === "success") {
      const email = params.get("email") || "";
      toast.success(`Google connected${email ? ` as ${email}` : ""}`);
      window.history.replaceState({}, "", "/connections");
    } else if (googleResult === "error") {
      const reason = params.get("reason") || "unknown";
      toast.error(`Google connection failed: ${reason}`);
      window.history.replaceState({}, "", "/connections");
    }
  }, [searchString]);

  const { data: connections, isLoading } = trpc.connections.list.useQuery();

  const addMutation = trpc.connections.add.useMutation({
    onSuccess: () => {
      toast.success("Connection added!");
      utils.connections.list.invalidate();
      setIsAdding(false);
      resetForm();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const revokeMutation = trpc.connections.revoke.useMutation({
    onSuccess: () => {
      toast.success("Connection revoked!");
      utils.connections.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const resetForm = () => {
    setProvider("");
    setType("generic_api_key");
    setDisplayName("");
    setCredentials("");
    setShowCredentials(false);
  };

  const handleAdd = () => {
    addMutation.mutate({
      provider,
      type,
      displayName: displayName || undefined,
      encryptedCredentials: credentials,
    });
  };

  const handleRevoke = (id: number) => {
    if (confirm("Are you sure you want to revoke this connection?")) {
      revokeMutation.mutate({ id });
    }
  };

  const all = connections ?? [];
  const active = all.filter((c) => c.status === "active").length;
  const list = query.trim()
    ? all.filter((c) => `${c.displayName ?? ""} ${c.provider}`.toLowerCase().includes(query.trim().toLowerCase()))
    : all;

  return (
    <ListPage
      title="Connections"
      lede="What Sutaeru can reach. Keys stay on the server."
      fold={fold}
      wide
      actions={
        <button type="button" className="btn" onClick={() => setIsAdding(!isAdding)}>
          {isAdding ? "Cancel" : "Add Connection"}
        </button>
      }
    >
      <ListFolds fold={fold}>
        <ListFold
          id="google"
          index={1}
          fold={fold}
          label="Google Workspace"
          pick={googleState === "connected" ? "Connected" : googleState === "off" ? "Not configured" : googleState === "ready" ? "Not connected" : "Checking"}
          mini={pickArt("src-drive")}
        >
          <GoogleWorkspace onState={setGoogleState} />
        </ListFold>

        <ListFold id="messaging" index={2} fold={fold} label="Messaging" pick="WhatsApp and Telegram" mini={pickArt("nav-chat")}>
          <MessagingCard />
        </ListFold>

        <ListFold
          id="linked"
          index={3}
          fold={fold}
          label="Linked services"
          pick={isLoading ? "Checking" : `${active} of ${all.length} active`}
          mini={pickArt("src-files")}
        >
          {isLoading ? (
            <RowsSkeleton rows={3} />
          ) : all.length === 0 ? (
            <ListEmpty
              title="No connections yet."
              text="Add connections to enable your Sutaeru agent to interact with external services"
              icon="connections"
              action={
                <button type="button" className="btn" onClick={() => setIsAdding(true)}>
                  Add Connection
                </button>
              }
            />
          ) : (
            <>
              <SearchBar value={query} onChange={setQuery} label="Search connections" placeholder="Search connections…" count={`${list.length} / ${all.length}`} />
              <Rows label="Connections">
                {list.map((connection) => {
                  const status = statusConfig[connection.status];
                  const isActive = connection.status === "active";
                  const name = connection.displayName || connection.provider;

                  return (
                    <Row
                      key={connection.id}
                      title={name}
                      initials={name.charAt(0).toUpperCase()}
                      meta={`${connectionTypeLabels[connection.type]} · PROVIDER ${connection.provider}${
                        connection.lastUsedAt ? ` · LAST USED ${format(new Date(connection.lastUsedAt), "MMM d, yyyy")}` : ""
                      } · ADDED ${format(new Date(connection.createdAt), "MMM d, yyyy")}`}
                      quiet={!isActive}
                      status={<StatusPill status={status.pill} />}
                      actions={
                        isActive ? (
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => handleRevoke(connection.id)}
                            disabled={revokeMutation.isPending}
                          >
                            Revoke
                          </button>
                        ) : null
                      }
                    />
                  );
                })}
              </Rows>
            </>
          )}
        </ListFold>

        <ListFold id="add" index={4} fold={fold} label="Add a connection" pick={provider || "provider, type, key"} mini={pickArt("forge-mountain")}>
          <div className="lst-form">
            <div className="lst-form-row">
              <div className="lst-field">
                <label className="mono" htmlFor="provider">
                  Provider
                </label>
                <input id="provider" className="lst-input" placeholder="e.g., Slack, GitHub" value={provider} onChange={(e) => setProvider(e.target.value)} />
              </div>
              <div className="lst-field">
                <label className="mono" htmlFor="connDisplayName">
                  Display name
                </label>
                <input id="connDisplayName" className="lst-input" placeholder="My Slack key" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
            </div>

            <div className="lst-field">
              <span className="mono">Type</span>
              <PickTiles label="Connection type" items={TYPE_TILES} value={type} onChange={(id) => setType(id as typeof type)} />
            </div>

            <div className="lst-field">
              <label className="mono" htmlFor="credentials">
                Credentials
              </label>
              <div className="row" style={{ gap: 8 }}>
                <input
                  id="credentials"
                  type={showCredentials ? "text" : "password"}
                  className="lst-input"
                  placeholder="API key, token, or credentials"
                  value={credentials}
                  onChange={(e) => setCredentials(e.target.value)}
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={showCredentials ? "Hide credentials" : "Show credentials"}
                  onClick={() => setShowCredentials(!showCredentials)}
                >
                  {showCredentials ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="lst-note">Your credentials are encrypted before storage</p>
            </div>

            <div className="lst-form-foot">
              <button type="button" className="btn ghost" onClick={() => setIsAdding(false)}>
                Cancel
              </button>
              <button type="button" className="btn" onClick={handleAdd} disabled={!provider || !credentials || addMutation.isPending}>
                {addMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Add Connection
              </button>
            </div>
          </div>
        </ListFold>

        <ListFold id="privacy" index={5} fold={fold} label="Your keys" pick="Encrypted at rest" mini={pickArt("theme-auto")}>
          <section className="sk-card-dark skx-conn-privacy">
            <div className="sk-row" style={{ gap: 18, minWidth: 0 }}>
              <SutaeruIcon name="lock" width={30} height={30} style={{ color: "var(--art-paper)", flex: "none" }} />
              <div className="sk-col">
                <p className="sk-dark-title">Your credentials are encrypted before storage</p>
              </div>
            </div>
            <HalftoneRamp columns={8} rows={6} className="skx-conn-ramp" />
          </section>
        </ListFold>
      </ListFolds>
    </ListPage>
  );
}

