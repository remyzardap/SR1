import { useState, useEffect } from "react";
import { ShieldAlert, Check, X, Clock, ChevronDown, ChevronUp, Loader2, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getAuthToken } from "@/lib/authSession";
import type { ApprovalRequest } from "@/lib/sse";

export interface ApprovalCardProps {
  approval: ApprovalRequest;
  onDecision?: (id: string, decision: "approve" | "reject") => void;
  className?: string;
}

export function ApprovalCard({ approval, onDecision, className }: ApprovalCardProps) {
  const [status, setStatus] = useState<"idle" | "submitting" | "approved" | "rejected" | "expired">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedArgsText, setEditedArgsText] = useState(() =>
    JSON.stringify(approval.args ?? {}, null, 2)
  );
  const [timeRemaining, setTimeRemaining] = useState<string>("");

  const expiresAtMs = approval.expiresAt
    ? typeof approval.expiresAt === "number"
      ? approval.expiresAt
      : new Date(approval.expiresAt).getTime()
    : null;

  useEffect(() => {
    if (!expiresAtMs) return;

    const updateTimer = () => {
      const now = Date.now();
      const diffMs = expiresAtMs - now;
      if (diffMs <= 0) {
        setTimeRemaining("Expired");
        if (status === "idle") {
          setStatus("expired");
        }
        return;
      }
      const mins = Math.floor(diffMs / 60000);
      const secs = Math.floor((diffMs % 60000) / 1000);
      setTimeRemaining(`${mins}:${String(secs).padStart(2, "0")}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAtMs, status]);

  const handleAction = async (decision: "approve" | "reject") => {
    if (status !== "idle") return;
    setStatus("submitting");
    setError(null);

    let parsedArgs: Record<string, unknown> | undefined;
    if (decision === "approve" && isEditing) {
      try {
        parsedArgs = JSON.parse(editedArgsText);
      } catch (err) {
        setError(`Invalid JSON arguments: ${(err as Error).message}`);
        setStatus("idle");
        return;
      }
    }

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/kemma/approvals/${encodeURIComponent(approval.id)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          decision,
          ...(parsedArgs ? { args: parsedArgs } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server returned ${res.status}`);
      }

      const nextStatus = decision === "approve" ? "approved" : "rejected";
      setStatus(nextStatus);
      onDecision?.(approval.id, decision);
    } catch (err) {
      setError((err as Error).message ?? "Failed to submit decision");
      setStatus("idle");
    }
  };

  // Render preview details cleanly if JSON or formatted string
  let parsedPreview: Record<string, unknown> | null = null;
  if (typeof approval.preview === "string" && approval.preview.trim().startsWith("{")) {
    try {
      parsedPreview = JSON.parse(approval.preview);
    } catch {
      parsedPreview = null;
    }
  }

  return (
    <div
      role="region"
      aria-label="Action approval request"
      className={cn(
        "my-3 w-full max-w-2xl rounded-xl border border-border/60 bg-card p-4 text-card-foreground shadow-sm transition-all sm:p-5",
        status === "approved" && "border-green-500/40 bg-green-500/5",
        status === "rejected" && "border-destructive/40 bg-destructive/5",
        status === "expired" && "border-muted-foreground/30 opacity-75",
        className
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-500" aria-hidden="true" />
          <h3 className="text-sm font-semibold sm:text-base">
            {approval.title || `Action confirmation required`}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {approval.tool}
          </Badge>
          {timeRemaining && status === "idle" && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {timeRemaining}
            </span>
          )}
        </div>
      </div>

      {/* Preview Content */}
      <div className="py-3 text-sm">
        {parsedPreview ? (
          <div className="space-y-2 rounded-lg bg-muted/30 p-3 text-xs sm:text-sm">
            {Object.entries(parsedPreview).map(([key, value]) => {
              if (key === "title") return null;
              return (
                <div key={key} className="flex flex-col sm:flex-row sm:gap-2">
                  <span className="font-medium text-muted-foreground capitalize sm:w-28 sm:shrink-0">
                    {key.replace(/([A-Z])/g, " $1")}:
                  </span>
                  <span className="font-mono text-foreground break-words sm:flex-1">
                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : approval.preview ? (
          <p className="whitespace-pre-wrap rounded-lg bg-muted/30 p-3 text-xs leading-relaxed text-foreground sm:text-sm">
            {approval.preview}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground sm:text-sm">
            The agent is requesting permission to execute tool <strong>{approval.tool}</strong>.
          </p>
        )}

        {/* Edit parameters toggle */}
        {status === "idle" && Boolean(approval.args) && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setIsEditing((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Edit3 className="h-3 w-3" aria-hidden="true" />
              <span>{isEditing ? "Hide arguments editor" : "View / Edit arguments"}</span>
              {isEditing ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {isEditing && (
              <div className="mt-2 space-y-1">
                <textarea
                  value={editedArgsText}
                  onChange={(e) => setEditedArgsText(e.target.value)}
                  rows={4}
                  aria-label="Tool parameters JSON editor"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <p className="text-[11px] text-muted-foreground">
                  You can modify parameters before approving. Changes will be validated against the tool schema.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error alert if any */}
      {error && (
        <div role="alert" className="mb-3 rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Status banner or Action buttons */}
      <div className="flex items-center justify-end gap-2.5 pt-2">
        {status === "approved" ? (
          <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" />
            <span>Approved</span>
          </div>
        ) : status === "rejected" ? (
          <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <X className="h-4 w-4" />
            <span>Declined</span>
          </div>
        ) : status === "expired" ? (
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Expired</span>
          </div>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={status === "submitting"}
              onClick={() => void handleAction("reject")}
              className="px-4 text-xs font-medium"
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Decline
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={status === "submitting"}
              onClick={() => void handleAction("approve")}
              className="bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              {status === "submitting" ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Approve
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
