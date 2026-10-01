import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@/lib/utils";

export default function Admin() {
  const { data: users, isLoading, error } = trpc.admin.userStats.useQuery();

  const header = (
    <header className="sk-header">
      <div>
        <h1 className="sk-h1">Admin</h1>
        <p className="sk-sub">Workspace health, people and activity.</p>
      </div>
      <div className="sk-actions">
        <Link href="/admin/audit-logs" className="sk-btn">Audit logs</Link>
      </div>
    </header>
  );

  if (error) {
    return (
      <div className="sk-page">
        {header}
        <div className="sk-card sk-empty">
          <span className="sk-label">Access Denied</span>
          <p className="sk-empty-text">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sk-page">
      {header}

      <div className="sk-stack">
        {/* Stats */}
        <div className="sk-grid-3">
          <div className="sk-card sk-stat">
            <span className="sk-label">Total Users</span>
            <p className="sk-stat-num">{users?.length ?? 0}</p>
          </div>
          <div className="sk-card sk-stat">
            <span className="sk-label">Total Files</span>
            <p className="sk-stat-num">{users?.reduce((acc, u) => acc + (u.filesGenerated || 0), 0) ?? 0}</p>
          </div>
          <div className="sk-card sk-stat">
            <span className="sk-label">Admins</span>
            <p className="sk-stat-num">{users?.filter(u => u.role === "admin").length ?? 0}</p>
          </div>
        </div>

        {/* Users Table */}
        <section>
          <div className="sk-tablewrap">
            {isLoading ? (
              <div className="sk-empty">
                <span className="sk-label">All Users</span>
                <div className="sk-row">
                  <Loader2 className="h-4 w-4 animate-spin sk-muted" />
                </div>
              </div>
            ) : !users || users.length === 0 ? (
              <div className="sk-empty">
                <span className="sk-label">All Users</span>
                <p className="sk-empty-text">No users found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="sk-table" style={{ minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th>People</th>
                      <th>Role</th>
                      <th style={{ textAlign: "right" }}>Files Generated</th>
                      <th style={{ textAlign: "right" }}>Joined Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td data-label="Name">
                          <div className="sk-row">
                            <span className="sk-avatar">{(user.name || user.email || "").trim().charAt(0).toUpperCase() || "-"}</span>
                            <div className="sk-col">
                              <span className="sk-td-title">{user.name ?? "-"}</span>
                              <span className="sk-muted break-all">{user.email ?? "-"}</span>
                            </div>
                          </div>
                        </td>
                        <td data-label="Role">
                          <span className="sk-chip">{user.role === "admin" ? "Admin" : "User"}</span>
                        </td>
                        <td data-label="Files Generated" className="sk-td-mono text-right">{user.filesGenerated ?? 0}</td>
                        <td data-label="Joined Date" className="sk-td-mono text-right">{formatDate(user.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
