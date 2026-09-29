import { PAGE_BG, NOISE_OVERLAY, CSS_ANIM } from '@/lib/design';
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plug,
  Loader2,
  Plus,
  Ban,
  Key,
  Lock,
  Globe,
  Cpu,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  EyeOff,
  Mail,
  Calendar,
  HardDrive,
  ExternalLink,
  Unplug,
} from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const connectionTypeIcons = {
  llm_api_key: Cpu,
  oauth2: Globe,
  generic_api_key: Key,
};
const connectionTypeLabels = {
  llm_api_key: "LLM API Key",
  oauth2: "OAuth 2.0",
  generic_api_key: "API Key",
};
const connectionTypeColors = {
  llm_api_key: "bg-secondary text-foreground border-border",
  oauth2: "bg-secondary text-foreground border-border",
  generic_api_key: "bg-secondary text-foreground border-border",
};
const statusConfig = {
  active: { icon: CheckCircle2, color: "text-[var(--state-success)]", label: "Active" },
  revoked: { icon: XCircle, color: "text-destructive", label: "Revoked" },
  expired: { icon: Clock, color: "text-[var(--state-warning)]", label: "Expired" },
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
      <Card className="mb-6 border-dashed border-muted-foreground/30" data-testid="card-google-not-configured">
       <CardContent className="flex flex-wrap items-center gap-4 py-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <SiGoogle className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-foreground">Google Workspace</h3>
            <p className="text-sm text-muted-foreground">
              Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Gmail, Calendar & Drive
            </p>
          </div>
          <Badge variant="outline" className="text-muted-foreground">Not Configured</Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6" data-testid="card-google-workspace">
      <CardHeader className="pb-3">
         <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
             <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-secondary">
               <SiGoogle className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <CardTitle className="text-lg">Google Workspace</CardTitle>
              <CardDescription>
                {status?.connected
                  ? `Connected as ${status.email}`
                  : "Connect Gmail, Calendar & Drive to S1"}
              </CardDescription>
            </div>
          </div>
          {status?.connected ? (
            <Badge className="bg-secondary text-[var(--state-success)] border-border">Connected</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Disconnected</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
         <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-3 mb-4">
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
             <Mail className="h-4 w-4 text-foreground" />
            <span className="text-sm">Gmail</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
             <Calendar className="h-4 w-4 text-foreground" />
            <span className="text-sm">Calendar</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
             <HardDrive className="h-4 w-4 text-foreground" />
            <span className="text-sm">Drive</span>
          </div>
        </div>

        {status?.connected ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-destructive hover:bg-destructive/10"
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
            data-testid="button-disconnect-google"
          >
            {disconnectMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Unplug className="mr-2 h-4 w-4" />
            )}
            Disconnect Google
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={() => {
              if (authUrlData?.url) window.location.href = authUrlData.url;
            }}
            disabled={statusLoading || !authUrlData?.url}
            data-testid="button-connect-google"
          >
            {statusLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="mr-2 h-4 w-4" />
            )}
            Connect Google Account
          </Button>
        )}
      </CardContent>
    </Card>
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
     <div className="sutaeru-editorial-page mx-auto max-w-4xl px-3 py-6 sm:px-4 sm:py-8">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading connections...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Page header */}
       <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-700 text-foreground">Connections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage external service connections for your agent
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={isAdding ? "secondary" : "default"}
            onClick={() => setIsAdding(!isAdding)}
          >
            {isAdding ? "Cancel" : <><Plus className="mr-2 h-4 w-4" /> Add Connection</>}
          </Button>
        </div>
      </div>

      {/* Google Workspace */}
      <GoogleWorkspaceCard />

      {/* Add Connection Form */}
      {isAdding && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Add New Connection</CardTitle>
            <CardDescription>
              Connect your agent to external services and APIs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="provider">Provider *</Label>
                <Input
                  id="provider"
                  placeholder="e.g., OpenAI, Slack, GitHub"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="connType">Type *</Label>
                <Select value={type} onValueChange={(v: any) => setType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="llm_api_key">LLM API Key</SelectItem>
                    <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                    <SelectItem value="generic_api_key">Generic API Key</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="connDisplayName">Display Name</Label>
              <Input
                id="connDisplayName"
                placeholder="My OpenAI Key"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="credentials">Credentials *</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="credentials"
                  type={showCredentials ? "text" : "password"}
                  className="pl-9 pr-10"
                  placeholder="API key, token, or credentials"
                  value={credentials}
                  onChange={(e) => setCredentials(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                   className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 p-0"
                   aria-label={showCredentials ? "Hide credentials" : "Show credentials"}
                  onClick={() => setShowCredentials(!showCredentials)}
                >
                  {showCredentials ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Your credentials are encrypted before storage
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAdd}
                disabled={!provider || !credentials || addMutation.isPending}
              >
                {addMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Add Connection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connections Grid */}
      {connections && connections.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {connections.map((connection) => {
            const TypeIcon = connectionTypeIcons[connection.type];
            const StatusIcon = statusConfig[connection.status].icon;
            const statusColor = statusConfig[connection.status].color;
            const isActive = connection.status === "active";

            return (
              <Card
                key={connection.id}
                className={cn(
                  !isActive && "opacity-75"
                )}
              >
                <CardHeader className="pb-3">
                   <div className="flex flex-wrap items-start justify-between gap-3">
                     <div className="flex min-w-0 items-center gap-3">
                      <div className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-lg",
                        connectionTypeColors[connection.type].split(" ")[0]
                      )}>
                        <TypeIcon className="h-5 w-5" />
                      </div>
                       <div className="min-w-0">
                         <CardTitle className="text-base break-words">
                          {connection.displayName || connection.provider}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge
                            variant="outline"
                            className={cn("text-xs", connectionTypeColors[connection.type])}
                          >
                            {connectionTypeLabels[connection.type]}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <StatusIcon className={cn("h-4 w-4", statusColor)} />
                      <span className={cn("text-xs font-medium", statusColor)}>
                        {statusConfig[connection.status].label}
                      </span>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Provider</span>
                      <span className="font-medium capitalize">{connection.provider}</span>
                    </div>

                    {connection.lastUsedAt && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Last Used</span>
                        <span>{format(new Date(connection.lastUsedAt), "MMM d, yyyy")}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Added</span>
                      <span>{format(new Date(connection.createdAt), "MMM d, yyyy")}</span>
                    </div>
                  </div>

                  {isActive && (
                    <div className="mt-4 pt-3 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleRevoke(connection.id)}
                        disabled={revokeMutation.isPending}
                      >
                        <Ban className="mr-2 h-4 w-4" />
                        Revoke Connection
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Plug className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-lg font-medium">No connections yet</h3>
              <p className="mt-1 text-sm text-muted-foreground text-center max-w-sm">
                Add connections to enable your Sutaeru agent to interact with external services
              </p>
              <Button className="mt-4" onClick={() => setIsAdding(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Connection
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
