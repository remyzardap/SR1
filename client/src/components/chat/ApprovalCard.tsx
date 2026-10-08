import { useEffect, useId, useMemo, useState } from "react";
import {
  ShieldAlert,
  Check,
  X,
  Clock,
  ChevronDown,
  ChevronUp,
  Code,
  Loader2,
  Edit3,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getAuthToken } from "@/lib/authSession";
import type { ApprovalRequest } from "@/lib/sse";
import {
  buildArgs,
  countdownFor,
  deriveFields,
  editedArgsIfChanged,
  EXPIRED_COPY,
  fieldsFromJsonText,
  formToJsonText,
  isLongText,
  toArgsObject,
  toExpiresAtMs,
  valuesFromFields,
  type ApprovalField,
  type FieldValue,
  type FieldValues,
} from "@/lib/approvalForm";

export interface ApprovalCardProps {
  approval: ApprovalRequest;
  onDecision?: (id: string, decision: "approve" | "reject") => void;
  className?: string;
}

type Status = "idle" | "submitting" | "approved" | "rejected";

/** Six lines — the same cut `COLLAPSE_LINES` describes in `@/lib/approvalForm`. */
const CLAMP_CLASS = "line-clamp-6";

export function ApprovalCard({
  approval,
  onDecision,
  className,
}: ApprovalCardProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const rawJsonId = useId();

  // The arguments as they arrived: the bar anything edited is compared against, so a decision that
  // changed nothing posts a bare decision like it always did (T-83).
  const originalArgs = useMemo(
    () => toArgsObject(approval.args),
    [approval.args],
  );
  const [fields, setFields] = useState<ApprovalField[]>(() =>
    deriveFields(approval.args),
  );
  const [values, setValues] = useState<FieldValues>(() =>
    valuesFromFields(fields),
  );

  // The deadline comes from the server (`expiresAt`); the card only ever asks how much of it is left.
  const deadlineMs = toExpiresAtMs(approval.expiresAt);
  const countdown = countdownFor(approval.expiresAt, nowMs);
  const expired = countdown.expired;
  const ticking = status === "idle" && deadlineMs !== null && !expired;

  useEffect(() => {
    if (!ticking) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);

  const built = useMemo(() => buildArgs(fields, values), [fields, values]);
  const parsedAdvanced = useMemo(
    () => (advanced ? fieldsFromJsonText(jsonText) : null),
    [advanced, jsonText],
  );

  const formInvalid = open && (advanced ? !parsedAdvanced?.ok : !built.ok);
  const advancedError =
    parsedAdvanced && !parsedAdvanced.ok ? parsedAdvanced.error : null;
  // What would go back to the server if the person approved right now, or null to send nothing.
  const changedArgs = useMemo(() => {
    if (!open || !originalArgs) return null;
    if (advanced) {
      if (!parsedAdvanced || !parsedAdvanced.ok) return null;
      return editedArgsIfChanged(
        originalArgs,
        JSON.parse(jsonText) as Record<string, unknown>,
      );
    }
    return built.ok ? editedArgsIfChanged(originalArgs, built.args) : null;
  }, [open, advanced, parsedAdvanced, jsonText, built, originalArgs]);

  const handleAction = async (decision: "approve" | "reject") => {
    if (status !== "idle" || expired) return;
    setStatus("submitting");
    setError(null);

    const argsToSend =
      decision === "approve" && !formInvalid ? changedArgs : null;

    try {
      const token = getAuthToken();
      // Same origin prefix the rest of the client uses: in dev the server runs on its own port, and a
      // root-relative URL here would hit Vite instead of the API (P1-11).
      const apiOrigin = import.meta.env.VITE_SR1_API_ORIGIN || "";
      const res = await fetch(
        `${apiOrigin}/api/kemma/approvals/${encodeURIComponent(approval.id)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: "include",
          body: JSON.stringify({
            decision,
            ...(argsToSend ? { args: argsToSend } : {}),
          }),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server returned ${res.status}`);
      }

      setStatus(decision === "approve" ? "approved" : "rejected");
      onDecision?.(approval.id, decision);
    } catch (err) {
      setError((err as Error).message ?? "Failed to submit decision");
      setStatus("idle");
    }
  };

  const openAdvanced = () => {
    setJsonText(formToJsonText(fields, values, originalArgs ?? {}));
    setAdvanced(true);
  };

  const closeAdvanced = () => {
    if (!parsedAdvanced || !parsedAdvanced.ok) return;
    setFields(parsedAdvanced.fields);
    setValues(parsedAdvanced.values);
    setAdvanced(false);
  };

  const setValue = (key: string, next: FieldValue) =>
    setValues((prev) => ({ ...prev, [key]: next }));

  // Preview details are shown as rows when the server sent an object, otherwise as one block of text.
  const parsedPreview: Record<string, unknown> | null = useMemo(() => {
    if (
      typeof approval.preview !== "string" ||
      !approval.preview.trim().startsWith("{")
    ) {
      return null;
    }
    return toArgsObject(approval.preview);
  }, [approval.preview]);

  const previewRows = parsedPreview
    ? Object.entries(parsedPreview).filter(([key]) => key !== "title")
    : [];
  const previewText =
    typeof approval.preview === "string" ? approval.preview : "";
  // A preview that came as an object gets one control per long value; a block of text gets one.
  const showMoreNeeded = !parsedPreview && isLongText(previewText);
  const rawArgsText =
    originalArgs === null && approval.args !== undefined
      ? JSON.stringify(approval.args, null, 2)
      : null;

  return (
    <div
      role="region"
      aria-label="Action approval request"
      className={cn(
        "approval-card my-3 w-full max-w-2xl p-4 transition-all sm:p-5",
        status === "approved" && "is-approved",
        status === "rejected" && "is-rejected",
        expired && "opacity-75",
        className,
      )}
    >
      {/* Header: the title and the tool never share a row that a long name could push sideways. */}
      <div className="flex min-w-0 flex-col gap-2 border-b border-border/40 pb-3">
        <div className="flex min-w-0 items-start gap-2">
          <ShieldAlert
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-500"
            aria-hidden="true"
          />
          <h3 className="min-w-0 break-words text-sm font-semibold sm:text-base">
            {approval.title || "Action confirmation required"}
          </h3>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Badge
            variant="outline"
            className="max-w-full break-all font-mono text-xs"
          >
            {approval.tool}
          </Badge>
          {countdown.hasDeadline && !expired && status === "idle" && (
            <span
              className={cn(
                "flex items-center gap-1 text-xs text-muted-foreground",
                countdown.urgent &&
                  "font-medium text-amber-600 dark:text-amber-400",
              )}
            >
              <Clock className="h-3 w-3" aria-hidden="true" />
              {countdown.text}
            </span>
          )}
        </div>
      </div>

      {/* Preview Content */}
      <div className="py-3 text-sm">
        {parsedPreview ? (
          <div className="min-w-0 space-y-2 rounded-lg bg-muted/30 p-3 text-xs sm:text-sm">
            {previewRows.map(([key, value]) => {
              const text =
                typeof value === "object" && value !== null
                  ? JSON.stringify(value, null, 2)
                  : String(value ?? "");
              return (
                <div
                  key={key}
                  className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 sm:flex-nowrap"
                >
                  <span className="shrink-0 font-medium text-muted-foreground sm:w-28">
                    {key.replace(/([A-Z])/g, " $1")}:
                  </span>
                  <LongValue text={text} />
                </div>
              );
            })}
          </div>
        ) : previewText ? (
          <p
            className={cn(
              "min-w-0 break-words rounded-lg bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap text-foreground sm:text-sm",
              !showMore && showMoreNeeded && CLAMP_CLASS,
            )}
          >
            {previewText}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground sm:text-sm">
            The agent is requesting permission to execute tool{" "}
            <strong>{approval.tool}</strong>.
          </p>
        )}

        {showMoreNeeded && (
          <button
            type="button"
            onClick={() => setShowMore((prev) => !prev)}
            className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={showMore}
          >
            {showMore ? (
              <>
                <ChevronUp className="h-3 w-3" aria-hidden="true" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
                Show more
              </>
            )}
          </button>
        )}

        {/* Arguments the card cannot break into fields are still shown, just not editable. */}
        {rawArgsText !== null && (
          <div className="mt-2 rounded-lg bg-muted/30 p-3">
            <LongValue text={rawArgsText} className="text-xs" />
          </div>
        )}

        {/* Argument editor: one labelled box per argument, or the raw JSON when asked for. */}
        {status === "idle" && originalArgs !== null && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              aria-expanded={open}
            >
              <Edit3 className="h-3 w-3" aria-hidden="true" />
              <span>{open ? "Hide argument editor" : "Edit arguments"}</span>
              {open ? (
                <ChevronUp className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              )}
            </button>

            {open && (
              <div className="mt-2 space-y-3">
                {advanced ? (
                  <div className="space-y-1">
                    <Label htmlFor={rawJsonId}>Arguments (JSON)</Label>
                    <Textarea
                      id={rawJsonId}
                      value={jsonText}
                      onChange={(event) => setJsonText(event.target.value)}
                      rows={8}
                      className="max-h-64 overflow-y-auto font-mono text-xs"
                      aria-label="Tool arguments JSON"
                      aria-invalid={Boolean(advancedError)}
                      aria-describedby={
                        advancedError ? `${rawJsonId}-error` : undefined
                      }
                    />
                    {advancedError && (
                      <p
                        id={`${rawJsonId}-error`}
                        className="text-xs text-destructive"
                      >
                        {advancedError}
                      </p>
                    )}
                  </div>
                ) : fields.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    These arguments have nothing to change.
                  </p>
                ) : (
                  fields.map((field) => (
                    <FieldEditor
                      key={field.key}
                      field={field}
                      value={values[field.key]}
                      error={built.ok ? undefined : built.errors[field.key]}
                      onChange={(next) => setValue(field.key, next)}
                    />
                  ))
                )}

                <p className="text-xs text-muted-foreground">
                  {advanced
                    ? "Advanced mode sends the arguments exactly as written. The tool checks them before the agent runs."
                    : "Only what you change is sent back. The tool checks it before the agent runs."}
                </p>

                <button
                  type="button"
                  onClick={advanced ? closeAdvanced : openAdvanced}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Code className="h-3 w-3" aria-hidden="true" />
                  {advanced ? "Back to the form" : "Advanced: edit as JSON"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error alert if any */}
      {error && (
        <div
          role="alert"
          className="mb-3 rounded-md bg-destructive/10 p-2.5 text-xs break-words text-destructive"
        >
          {error}
        </div>
      )}

      {expired && status === "idle" && (
        <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Clock className="h-4 w-4" aria-hidden="true" />
          {EXPIRED_COPY}
        </p>
      )}

      {/* Status banner or Action buttons */}
      <div className="flex flex-col gap-2.5 pt-2">
        {status === "approved" ? (
          <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" />
            <span>Approved</span>
          </div>
        ) : status === "rejected" ? (
          <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <X className="h-4 w-4" />
            <span>Rejected</span>
          </div>
        ) : (
          <>
            {formInvalid && (
              <p className="text-xs text-destructive">
                Fix the marked argument first.
              </p>
            )}
            <Button
              type="button"
              size="lg"
              disabled={status === "submitting" || expired || formInvalid}
              onClick={() => void handleAction("approve")}
              className="w-full"
            >
              {status === "submitting" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Approve
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={status === "submitting" || expired}
              onClick={() => void handleAction("reject")}
              className="w-full"
            >
              <X className="h-4 w-4" />
              Reject
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** One argument, one labelled control, one plain-words error when the value cannot be used yet. */
function FieldEditor({
  field,
  value,
  error,
  onChange,
}: {
  field: ApprovalField;
  value: FieldValue | undefined;
  error: string | undefined;
  onChange: (next: FieldValue) => void;
}) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const describedBy = error ? errorId : undefined;
  const invalid = Boolean(error);

  if (field.kind === "boolean") {
    const on = value === true;
    return (
      <div className="min-w-0 space-y-1">
        <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-input px-3 py-2">
          <Label
            htmlFor={inputId}
            className="min-w-0 cursor-pointer break-words text-sm"
          >
            {field.label}
          </Label>
          <button
            type="button"
            id={inputId}
            role="switch"
            aria-checked={on}
            aria-describedby={describedBy}
            onClick={() => onChange(!on)}
            className={cn(
              "relative h-5 w-9 shrink-0 rounded-full transition-colors",
              on ? "bg-primary" : "bg-muted-foreground/30",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-background transition-transform",
                on && "translate-x-4",
              )}
              aria-hidden="true"
            />
          </button>
        </div>
        <FieldError id={errorId} error={error} />
      </div>
    );
  }

  if (field.kind === "chips") {
    return (
      <ChipsEditor
        field={field}
        value={value}
        error={error}
        onChange={onChange}
      />
    );
  }

  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={inputId}>{field.label}</Label>
      {field.kind === "json" ? (
        <>
          <Textarea
            id={inputId}
            value={typeof value === "string" ? value : field.value}
            onChange={(event) => onChange(event.target.value)}
            rows={4}
            spellCheck={false}
            className="max-h-48 overflow-y-auto font-mono text-xs"
            aria-invalid={invalid}
            aria-describedby={describedBy}
          />
          <p className="text-xs text-muted-foreground">
            This is the raw value.
          </p>
        </>
      ) : field.kind === "number" ? (
        <Input
          id={inputId}
          type="number"
          inputMode="decimal"
          value={typeof value === "string" ? value : field.value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          aria-describedby={describedBy}
        />
      ) : field.multiline ? (
        <Textarea
          id={inputId}
          value={typeof value === "string" ? value : field.value}
          onChange={(event) => onChange(event.target.value)}
          rows={4}
          className="max-h-40 overflow-y-auto"
          aria-invalid={invalid}
          aria-describedby={describedBy}
        />
      ) : (
        <Input
          id={inputId}
          value={typeof value === "string" ? value : field.value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          aria-describedby={describedBy}
        />
      )}
      <FieldError id={errorId} error={error} />
    </div>
  );
}

/** A list of strings: chips you can remove, a box to add the next one. */
function ChipsEditor({
  field,
  value,
  error,
  onChange,
}: {
  field: ApprovalField;
  value: FieldValue | undefined;
  error: string | undefined;
  onChange: (next: FieldValue) => void;
}) {
  const [draft, setDraft] = useState("");
  const items = Array.isArray(value) ? value : [];
  const inputId = useId();

  const add = () => {
    const next = draft.trim();
    if (!next) return;
    onChange([...items, next]);
    setDraft("");
  };

  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={inputId}>{field.label}</Label>
      {items.length > 0 && (
        <ul className="flex min-w-0 flex-wrap gap-1.5">
          {items.map((item, index) => (
            <li
              key={`${index}-${item}`}
              className="flex max-w-full min-w-0 items-center gap-1 rounded-full border border-input bg-muted/40 py-1 pr-1 pl-2.5 text-xs"
            >
              <span className="min-w-0 break-words">{item}</span>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, at) => at !== index))}
                aria-label={`Remove ${item}`}
                className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex min-w-0 gap-1.5">
        <Input
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="Add another"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={add}
          aria-label={`Add to ${field.label}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <FieldError id={`${inputId}-error`} error={error} />
    </div>
  );
}

function FieldError({ id, error }: { id: string; error: string | undefined }) {
  if (!error) return null;
  return (
    <p id={id} className="min-w-0 text-xs break-words text-destructive">
      {error}
    </p>
  );
}

/**
 * A long value is folded to a few lines and the rest waits behind "Show more", so the card stays
 * shorter than the screen and the buttons never end up under the keyboard. The clamp class is
 * written out because Tailwind only generates utilities it can see in the source; it matches
 * `COLLAPSE_LINES` in `@/lib/approvalForm`.
 */
function LongValue({ text, className }: { text: string; className?: string }) {
  const [shown, setShown] = useState(false);
  const long = isLongText(text);
  return (
    <>
      <span
        className={cn(
          "min-w-0 flex-1 break-words whitespace-pre-wrap font-mono text-foreground",
          !shown && long && CLAMP_CLASS,
          className,
        )}
      >
        {text}
      </span>
      {long && (
        <button
          type="button"
          onClick={() => setShown((prev) => !prev)}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={shown}
        >
          {shown ? "Show less" : "Show more"}
        </button>
      )}
    </>
  );
}
