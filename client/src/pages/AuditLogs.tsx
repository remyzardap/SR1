/**
 * Audit logs — the security trail on the shared list pattern.
 *
 * The four numbers are one strip; the two filters and the events themselves are folds, so
 * an admin on a phone reads the newest events first and opens the filters when they need
 * them. Rows, not a table: the same name / mono line / status reading as every other list
 * page here, and the same page-at-a-time paging as before.
 */
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { ListEmpty, ListFold, ListFolds, ListPage, Row, Rows, RowsSkeleton, StatStrip, useListFolds } from "@/components/list";
import { pickArt } from "@/lib/pickArt";

const FOLD_IDS = ["filters", "events"];
const LIMIT = 50;

function formatTs(ts: number) {
  return new Date(ts).toLocaleString();
}

export default function AuditLogs() {
  const [offset, setOffset] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");

  const { data, isLoading, error } = trpc.audit.list.useQuery({
    limit: LIMIT,
    offset,
    action: actionFilter || undefined,
    userId: userFilter || undefined,
  });

  const { data: stats } = trpc.audit.getStats.useQuery();
  const fold = useListFolds("audit-logs", FOLD_IDS, { first: "events" });

  const head = (
    <Link href="/admin" className="btn ghost">
      Admin
    </Link>
  );

  if (error) {
    return (
      <section className="view view-enter lst-page">
        <header className="head-row">
          <div>
            <h1 className="title lst-title">Audit Logs</h1>
            <p className="lede lst-lede">Security and activity trail across the platform</p>
          </div>
          <div className="lst-actions">{head}</div>
        </header>
        <p className="mono" style={{ margin: "26px 0 0" }}>
          Access Denied
        </p>
        <p className="lede" style={{ marginTop: 8 }}>
          {error.message}
        </p>
      </section>
    );
  }

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const filtering = Boolean(actionFilter || userFilter);

  return (
    <ListPage
      title="Audit Logs"
      lede="Security and activity trail across the platform"
      fold={fold}
      wide
      actions={head}
    >
      {stats && (
        <StatStrip
          items={[
            { label: "Total events", value: stats.total },
            { label: "Failures", value: stats.failures, meter: stats.total ? stats.failures / stats.total : 0, meterLabel: `${stats.failures} of ${stats.total} failed` },
            { label: "Critical", value: stats.critical, meter: stats.total ? stats.critical / stats.total : 0, meterLabel: `${stats.critical} of ${stats.total} critical` },
            { label: "Last 24h", value: stats.last24h },
          ]}
        />
      )}

      <ListFolds fold={fold}>
        <ListFold
          id="filters"
          index={1}
          fold={fold}
          label="Filters"
          pick={filtering ? [actionFilter, userFilter].filter(Boolean).join(" · ") : "Everything"}
          mini={pickArt("depth-standard")}
        >
          <div className="lst-form-row">
            <div className="lst-field">
              <label className="mono" htmlFor="audit-action">
                Action
              </label>
              <input
                id="audit-action"
                className="lst-input"
                placeholder="Filter by action (e.g. user.login)"
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setOffset(0);
                }}
              />
            </div>
            <div className="lst-field">
              <label className="mono" htmlFor="audit-user">
                User
              </label>
              <input
                id="audit-user"
                className="lst-input"
                placeholder="Filter by user ID"
                value={userFilter}
                onChange={(e) => {
                  setUserFilter(e.target.value);
                  setOffset(0);
                }}
              />
            </div>
          </div>
        </ListFold>

        <ListFold
          id="events"
          index={2}
          fold={fold}
          label="Events"
          pick={isLoading ? "Checking" : total > LIMIT ? `${offset + 1}–${Math.min(offset + LIMIT, total)} of ${total}` : `${total} ${total === 1 ? "event" : "events"}`}
          mini={pickArt("depth-deep")}
        >
          {isLoading ? (
            <RowsSkeleton rows={5} />
          ) : logs.length === 0 ? (
            <ListEmpty title="No audit events found." text={filtering ? "Nothing matches these filters." : "Sign-ins and changes land here as they happen."} icon="review" />
          ) : (
            <>
              <Rows label="Audit events">
                {logs.map((log) => (
                  <Row
                    key={log.id}
                    title={<span className="mono ink">{log.action}</span>}
                    meta={`${log.userId || "system"} · ${log.resourceType ?? "—"}${log.resourceId ? ` #${log.resourceId}` : ""} · ${formatTs(log.createdAt)}`}
                    status={
                      <span className={log.status === "failure" ? "tag alert" : "tag quiet"}>
                        {log.severity}
                        {log.status === "failure" ? " · failed" : ""}
                      </span>
                    }
                    quiet={log.status === "failure"}
                    icon={log.status === "failure" ? "close" : "check"}
                  />
                ))}
              </Rows>

              {total > LIMIT && (
                <div className="between" style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                  >
                    Previous
                  </button>
                  <span className="mono tnum">
                    {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
                  </span>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={offset + LIMIT >= total}
                    onClick={() => setOffset(offset + LIMIT)}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </ListFold>
      </ListFolds>
    </ListPage>
  );
}
