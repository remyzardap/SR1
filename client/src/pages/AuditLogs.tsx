import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Shield, ClipboardList, AlertTriangle, CheckCircle, XCircle, Info } from "lucide-react";
import { trpc } from "@/lib/trpc";

const SEVERITY_STYLES: Record<string, string> = {
  info: "bg-secondary text-foreground border-border",
  warn: "bg-secondary text-[#8b6f43] border-border",
  error: "bg-destructive/10 text-destructive border-destructive/20",
  critical: "bg-destructive/15 text-destructive border-destructive/30",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  success: <CheckCircle className="h-3.5 w-3.5 text-[#4f6b4f]" />,
  failure: <XCircle className="h-3.5 w-3.5 text-destructive" />,
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
      <div className="sutaeru-editorial-page space-y-5">
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-destructive">
            <Shield className="h-12 w-12 opacity-60" />
            <p className="text-base font-medium">Access Denied</p>
            <p className="text-sm text-muted-foreground">{error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="sutaeru-editorial-page space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground text-sm mt-1">Security and activity trail across the platform</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Events", value: stats.total, icon: <ClipboardList className="h-5 w-5 text-foreground" /> },
            { label: "Failures", value: stats.failures, icon: <XCircle className="h-5 w-5 text-destructive" /> },
            { label: "Critical", value: stats.critical, icon: <AlertTriangle className="h-5 w-5 text-[#8b6f43]" /> },
            { label: "Last 24h", value: stats.last24h, icon: <Info className="h-5 w-5 text-[#4f6b4f]" /> },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                {s.icon}
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Filter by action (e.g. user.login)"
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setOffset(0); }}
           className="w-full sm:w-64"
        />
        <Input
          placeholder="Filter by user ID"
          value={userFilter}
          onChange={(e) => { setUserFilter(e.target.value); setOffset(0); }}
           className="w-full sm:w-48"
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Events</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data?.logs.length ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <ClipboardList className="h-10 w-10 opacity-40" />
              <p className="text-sm">No audit events found</p>
            </div>
          ) : (
             <div className="sutaeru-data-list">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2 font-medium">Time</th>
                    <th className="text-left px-4 py-2 font-medium">User</th>
                    <th className="text-left px-4 py-2 font-medium">Action</th>
                    <th className="text-left px-4 py-2 font-medium">Resource</th>
                    <th className="text-left px-4 py-2 font-medium">Severity</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logs.map((log) => (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                       <td data-label="Time" className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatTs(log.createdAt)}</td>
                       <td data-label="User" className="px-4 py-2 font-mono text-xs break-all">{log.userId}</td>
                       <td data-label="Action" className="px-4 py-2 font-mono text-xs break-all">{log.action}</td>
                       <td data-label="Resource" className="px-4 py-2 text-xs text-muted-foreground break-all">
                        {log.resourceType}{log.resourceId ? ` #${log.resourceId}` : ""}
                      </td>
                       <td data-label="Severity" className="px-4 py-2">
                        <Badge variant="outline" className={`text-[10px] ${SEVERITY_STYLES[log.severity] ?? ""}`}>
                          {log.severity}
                        </Badge>
                      </td>
                       <td data-label="Status" className="px-4 py-2">
                        <span className="flex items-center gap-1">
                          {STATUS_ICON[log.status] ?? null}
                          <span className="text-xs">{log.status}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > LIMIT && (
         <div className="flex flex-wrap items-center gap-3 justify-end text-sm">
          <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
            Previous
          </Button>
          <span className="text-muted-foreground">{offset + 1}–{Math.min(offset + LIMIT, data.total)} of {data.total}</span>
          <Button variant="outline" size="sm" disabled={offset + LIMIT >= data.total} onClick={() => setOffset(offset + LIMIT)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
