import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useSearch } from "wouter";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { format } from "date-fns";
import SutaeruIcon from "@/components/SutaeruIcon";
import MessagingCard from "@/components/MessagingLink";

const connectionTypeLabels = {
  llm_api_key: "LLM API Key",
  oauth2: "OAuth 2.0",
  generic_api_key: "API Key",
};

// active renders as the plain connected indicator (orange dot, no chip);
// revoked and expired keep a neutral chip so they read as inactive.
const statusConfig = {
  active: { label: "Active", cls: "sk-connected", dot: "sk-dot" },
  revoked: { label: "Revoked", cls: "sk-chip sk-chip-idle", dot: "sk-dot" },
  expired: { label: "Expired", cls: "sk-chip sk-chip-paused", dot: "sk-dot" },
};

function GoogleWorkspaceCard() {
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

  if (!configured?.configured) {
    return (
      <section className="sk-card sk-row" style={{ marginBottom: 28 }} data-testid="card-google-not-configured">
        <span className="sk-icon-tile">
          <SiGoogle />
        </span>
        <div className="sk-col" style={{ flex: "1 1 260px", gap: 2 }}>
          <h2 className="sk-tile-title">Google Workspace</h2>
          <p className="sk-muted" style={{ margin: 0 }}>
            Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Gmail, Calendar & Drive
          </p>
        </div>
        <span className="sk-label">Not Configured</span>
      </section>
    );
  }

  return (
    <section className="sk-card sk-col" style={{ marginBottom: 28, gap: 18 }} data-testid="card-google-workspace">
      <div className="sk-between">
        <div className="sk-row" style={{ gap: 14 }}>
          <span className="sk-icon-tile">
            <SiGoogle />
          </span>
          <div className="sk-col" style={{ gap: 2 }}>
            <h2 className="sk-tile-title">Google Workspace</h2>
            <p className="sk-muted" style={{ margin: 0 }}>
              {status?.connected
                ? `Connected as ${status.email}`
                : "Connect Gmail, Calendar & Drive to S1"}
            </p>
          </div>
        </div>
        {status?.connected ? (
          <span className="sk-connected">
            <span className="sk-dot" />
            Connected
          </span>
        ) : (
          <span className="sk-label">Disconnected</span>
        )}
      </div>

      <div className="sk-row" style={{ gap: 8 }}>
        <span className="sk-chip">Gmail</span>
        <span className="sk-chip">Calendar</span>
        <span className="sk-chip">Drive</span>
      </div>

      {status?.connected ? (
        <button
          type="button"
          className="sk-btn"
          style={{ width: "100%" }}
          onClick={() => disconnectMutation.mutate()}
          disabled={disconnectMutation.isPending}
          data-testid="button-disconnect-google"
        >
          {disconnectMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Disconnect Google
        </button>
      ) : (
        <button
          type="button"
          className="sk-btn"
          style={{ width: "100%" }}
          onClick={() => {
            if (authUrlData?.url) window.location.href = authUrlData.url;
          }}
          disabled={statusLoading || !authUrlData?.url}
          data-testid="button-connect-google"
        >
          {statusLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Connect Google Account
        </button>
      )}
    </section>
  );
}

export default function Connections() {
  const utils = trpc.useUtils();
  const searchString = useSearch();
  const [isAdding, setIsAdding] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);

  const [provider, setProvider] = useState("");
  const [type, setType] = useState<"llm_api_key" | "oauth2" | "generic_api_key">("generic_api_key");
  const [displayName, setDisplayName] = useState("");
  const [credentials, setCredentials] = useState("");

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

  if (isLoading) {
    return (
      <div className="sk-page">
        <div className="mx-auto w-full max-w-[1200px]">
          <div className="sk-card sk-empty">
            <span className="sk-label">Connections</span>
            <p className="sk-empty-text" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading connections...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sk-page">
      <div className="mx-auto w-full max-w-[1200px]">
        {/* Page header */}
        <header className="sk-header">
          <div>
            <h1 className="sk-h1">Connections</h1>
            <p className="sk-sub">Manage external service connections for your agent</p>
          </div>
          <div className="sk-actions">
            <button type="button" className="sk-btn" onClick={() => setIsAdding(!isAdding)}>
              {isAdding ? "Cancel" : "Add Connection"}
            </button>
          </div>
        </header>

        {/* Google Workspace */}
        <GoogleWorkspaceCard />

        {/* WhatsApp and Telegram (owner only) */}
        <MessagingCard />

        {/* Add Connection Form */}
        {isAdding && (
          <section className="sk-card sk-col" style={{ marginBottom: 28, gap: 20 }}>
            <div className="sk-col" style={{ gap: 4 }}>
              <h2 className="sk-tile-title" style={{ fontSize: 20 }}>Add New Connection</h2>
              <p className="sk-muted" style={{ margin: 0 }}>
                Connect your agent to external services and APIs
              </p>
            </div>

            <div className="sk-grid-2">
              <div className="sk-field">
                <label className="sk-label" htmlFor="provider">Provider *</label>
                <input
                  id="provider"
                  className="sk-input"
                  placeholder="e.g., OpenAI, Slack, GitHub"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                />
              </div>

              <div className="sk-field">
                <label className="sk-label" htmlFor="connType">Type *</label>
                <select
                  id="connType"
                  className="sk-select"
                  value={type}
                  onChange={(e) => setType(e.target.value as "llm_api_key" | "oauth2" | "generic_api_key")}
                >
                  <option value="llm_api_key">LLM API Key</option>
                  <option value="oauth2">OAuth 2.0</option>
                  <option value="generic_api_key">Generic API Key</option>
                </select>
              </div>
            </div>

            <div className="sk-field">
              <label className="sk-label" htmlFor="connDisplayName">Display Name</label>
              <input
                id="connDisplayName"
                className="sk-input"
                placeholder="My OpenAI Key"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="sk-field">
              <label className="sk-label" htmlFor="credentials">Credentials *</label>
              <div className="relative">
                <input
                  id="credentials"
                  type={showCredentials ? "text" : "password"}
                  className="sk-input pr-12"
                  placeholder="API key, token, or credentials"
                  value={credentials}
                  onChange={(e) => setCredentials(e.target.value)}
                />
                <button
                  type="button"
                  className="sk-icon-btn absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10"
                  aria-label={showCredentials ? "Hide credentials" : "Show credentials"}
                  onClick={() => setShowCredentials(!showCredentials)}
                >
                  {showCredentials ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="sk-muted" style={{ fontSize: 12, margin: 0 }}>
                Your credentials are encrypted before storage
              </p>
            </div>

            <div className="sk-row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="sk-btn sk-btn-ghost" onClick={() => setIsAdding(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="sk-btn"
                onClick={handleAdd}
                disabled={!provider || !credentials || addMutation.isPending}
              >
                {addMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Add Connection
              </button>
            </div>
          </section>
        )}

        {/* Connections Grid */}
        {connections && connections.length > 0 ? (
          <div className="sk-grid">
            {connections.map((connection) => {
              const status = statusConfig[connection.status];
              const isActive = connection.status === "active";
              const name = connection.displayName || connection.provider;

              return (
                <article key={connection.id} className="sk-tile" style={{ opacity: isActive ? 1 : 0.75 }}>
                  <span
                    className="sk-avatar"
                    style={{ width: 56, height: 56, borderRadius: 20, fontSize: 22 }}
                  >
                    {name.charAt(0).toUpperCase()}
                  </span>

                  <div className="sk-col" style={{ gap: 2 }}>
                    <h3 className="sk-tile-title">{name}</h3>
                    <p className="sk-muted" style={{ margin: 0, fontSize: 13 }}>
                      {connectionTypeLabels[connection.type]}
                    </p>
                  </div>

                  <hr className="sk-hairline" />

                  <div className="sk-col" style={{ gap: 6 }}>
                    <div className="sk-between">
                      <span className="sk-meta">Provider</span>
                      <span className="sk-num" style={{ fontSize: 13 }}>{connection.provider}</span>
                    </div>

                    {connection.lastUsedAt && (
                      <div className="sk-between">
                        <span className="sk-meta">Last Used</span>
                        <span className="sk-num" style={{ fontSize: 13 }}>
                          {format(new Date(connection.lastUsedAt), "MMM d, yyyy")}
                        </span>
                      </div>
                    )}

                    <div className="sk-between">
                      <span className="sk-meta">Added</span>
                      <span className="sk-num" style={{ fontSize: 13 }}>
                        {format(new Date(connection.createdAt), "MMM d, yyyy")}
                      </span>
                    </div>
                  </div>

                  <div className="sk-between" style={{ marginTop: "auto", gap: 8 }}>
                    <span className={status.cls}>
                      <span className={status.dot} />
                      {status.label}
                    </span>
                    {isActive && (
                      <button
                        type="button"
                        className="sk-btn sk-btn-ghost sk-btn-sm"
                        onClick={() => handleRevoke(connection.id)}
                        disabled={revokeMutation.isPending}
                      >
                        Revoke Connection
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="sk-card sk-empty">
            <span className="sk-icon-tile">
              <SutaeruIcon name="connections" width={26} height={26} />
            </span>
            <span className="sk-label">No connections yet</span>
            <p className="sk-empty-text" style={{ maxWidth: 420 }}>
              Add connections to enable your Sutaeru agent to interact with external services
            </p>
            <button type="button" className="sk-btn" style={{ marginTop: 8 }} onClick={() => setIsAdding(true)}>
              Add Connection
            </button>
          </div>
        )}

        {/* Privacy note */}
        <section className="sk-card-dark sk-row" style={{ marginTop: 28, gap: 18 }}>
          <SutaeruIcon name="admin" width={30} height={30} style={{ color: "var(--art-paper)", flex: "none" }} />
          <div className="sk-col">
            <p className="sk-dark-title">Your credentials are encrypted before storage</p>
          </div>
        </section>
      </div>
    </div>
  );
}
