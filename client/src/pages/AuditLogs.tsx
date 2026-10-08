import { useState } from "react";
import { Loader2 } from "lucide-react";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { trpc } from "@/lib/trpc";

const STATUS_ICON: Record<string, React.ReactNode> = {
  success: <SutaeruIcon name="check" signal={false} className="h-3.5 w-3.5" />,
  failure: <SutaeruIcon name="close" signal={false} className="h-3.5 w-3.5" />,
};

function formatTs(ts: number) {
  return new Date(ts).toLocaleString();
}

export default function AuditLogs() {
  const [offset, setOffset] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const LIMIT = 50;

  const { data, isLoading, error } = trpc.audit.list.useQuery({
    limit: LIMIT,
    offset,
    action: actionFilter || undefined,
    userId: userFilter || undefined,
  });

  const { data: stats } = trpc.audit.getStats.useQuery();

  if (error) {
    return (
      <div className="sk-page">
        <div className="sk-header">
          <div>
            <h1 className="sk-h1">Audit Logs</h1>
            <p className="sk-sub">Security and activity trail across the platform</p>
          </div>
        </div>
        <div className="sk-card sk-empty">
          <span className="sk-label">Access Denied</span>
          <p className="sk-empty-text">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sk-page">
      <div className="sk-header">
        <div>
          <h1 className="sk-h1">Audit Logs</h1>
          <p className="sk-sub">Security and activity trail across the platform</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="sk-grid mb-7">
          {[
            { label: "Total Events", value: stats.total },
            { label: "Failures", value: stats.failures },
            { label: "Critical", value: stats.critical },
            { label: "Last 24h", value: stats.last24h },
          ].map((s) => (
            <div key={s.label} className="sk-card sk-stat">
              <span className="sk-label">{s.label}</span>
              <div className="sk-stat-num">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="sk-toolbar">
        <div className="sk-search">
          <SutaeruIcon name="search" signal={false} />
          <input
            placeholder="Filter by action (e.g. user.login)"
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setOffset(0); }}
          />
        </div>
        <div className="sk-search">
          <SutaeruIcon name="search" signal={false} />
          <input
            placeholder="Filter by user ID"
            value={userFilter}
            onChange={(e) => { setUserFilter(e.target.value); setOffset(0); }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="sk-tablewrap">
        {isLoading ? (
          <div className="sk-empty">
            <span className="sk-label">Events</span>
            <p className="sk-empty-text flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading audit events
            </p>
          </div>
        ) : !data?.logs.length ? (
          <div className="sk-empty">
            <span className="sk-label">Events</span>
            <p className="sk-empty-text">No audit events found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="sk-table min-w-[820px]">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Severity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((log) => (
                  <tr key={log.id} className="transition-colors hover:bg-[var(--r-panel)]">
                    <td data-label="Time" className="sk-td-mono">{formatTs(log.createdAt)}</td>
                    <td data-label="User">
                      <div className="sk-row">
                        <span className="sk-avatar sk-avatar-sm">{(log.userId || "?").charAt(0).toUpperCase()}</span>
                        <span className="min-w-0 font-mono text-xs">{log.userId}</span>
                      </div>
                    </td>
                    <td data-label="Action" className="font-mono text-xs">{log.action}</td>
                    <td data-label="Resource" className="sk-muted text-xs">
                      {log.resourceType}{log.resourceId ? ` #${log.resourceId}` : ""}
                    </td>
                    <td data-label="Severity">
                      <span className="sk-chip">{log.severity}</span>
                    </td>
                    <td data-label="Status">
                      <span className="sk-chip">
                        {STATUS_ICON[log.status] ?? null}
                        <span>{log.status}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.total > LIMIT && (
        <div className="mt-7 flex flex-wrap items-center justify-end gap-3 text-sm">
          <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
            Previous
          </button>
          <span className="sk-muted">{offset + 1}–{Math.min(offset + LIMIT, data.total)} of {data.total}</span>
          <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" disabled={offset + LIMIT >= data.total} onClick={() => setOffset(offset + LIMIT)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
