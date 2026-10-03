import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@/lib/utils";
import { SteppedMeter, StatusPill } from "@/components/art";
import { PageTitle } from "@/components/chrome/PageTitle";
import "@/styles/admin.css";

/** Compact mono "last seen": 12 MIN, 2 H, YESTERDAY, then the date. */
function lastSeenLabel(iso: string | Date): string {
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (mins < 1) return "NOW";
  if (mins < 60) return `${mins} MIN`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} H`;
  const days = Math.round(hours / 24);
  if (days === 1) return "YESTERDAY";
  if (days < 7) return `${days} D`;
  return formatDate(iso).toUpperCase();
}

/** Someone who signed in in the last half hour reads as live. */
function isLive(iso: string | Date): boolean {
  return Date.now() - new Date(iso).getTime() < 30 * 60_000;
}

export default function Admin() {
  const { data: users, isLoading, error } = trpc.admin.userStats.useQuery();

  const header = (
    <header className="sk-header">
      <div>
        <PageTitle className="skx-title-flush">Admin</PageTitle>
        <p className="sk-sub">Workspace health, people and activity.</p>
      </div>
      <div className="sk-actions">
        <Link href="/admin/audit-logs" className="sk-btn">Audit logs</Link>
      </div>
    </header>
  );

  if (error) {
    return (
      <div className="sk-page sk-admin">
        {header}
        <div className="sk-card sk-empty">
          <span className="sk-label">Access Denied</span>
          <p className="sk-empty-text">{error.message}</p>
        </div>
      </div>
    );
  }

  const list = users ?? [];
  const total = list.length;
  const admins = list.filter((u) => u.role === "admin").length;
  const filesTotal = list.reduce((acc, u) => acc + (u.filesGenerated || 0), 0);
  const onboarded = list.filter((u) => u.onboarded).length;
  const withFiles = list.filter((u) => (u.filesGenerated || 0) > 0).length;
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const activeToday = list.filter((u) => new Date(u.lastSignedIn).getTime() >= startOfDay.getTime()).length;
  const share = (n: number) => (total > 0 ? n / total : 0);

  const stats = [
    { label: "Users", value: total, meter: share(onboarded), meterLabel: `${onboarded} of ${total} profiles set up` },
    { label: "Files", value: filesTotal, meter: share(withFiles), meterLabel: `${withFiles} of ${total} people have files` },
    { label: "Admins", value: admins, meter: share(admins), meterLabel: `${admins} of ${total} are admins` },
    { label: "Active today", value: activeToday, meter: share(activeToday), meterLabel: `${activeToday} of ${total} signed in today` },
  ];

  return (
    <div className="sk-page sk-admin">
      {header}

      <div className="sk-stack">
        {/* Stats */}
        <div className="skx-admin-stats">
          {stats.map((s) => (
            <div key={s.label} className="sk-card skx-admin-stat">
              <span className="sk-label">{s.label}</span>
              <p className="skx-admin-num">{s.value.toLocaleString()}</p>
              <SteppedMeter value={s.meter} segments={10} ariaLabel={s.meterLabel} />
            </div>
          ))}
        </div>

        {/* People */}
        <section>
          <p className="skx-admin-people-label">People</p>
          <div className="sk-card skx-admin-people">
            {isLoading ? (
              <p className="sk-empty-text">Loading people...</p>
            ) : total === 0 ? (
              <p className="sk-empty-text">No users found</p>
            ) : (
              list.map((user, i) => (
                <div key={user.id} className={`skx-admin-person${i === 0 ? " is-first" : ""}`}>
                  <span className="skx-admin-avatar" aria-hidden="true">
                    {(user.name || user.email || "").trim().charAt(0).toUpperCase() || "-"}
                  </span>
                  <div className="skx-admin-person-main">
                    <div className="skx-admin-person-top">
                      <p className="skx-admin-person-name">{user.name ?? "-"}</p>
                      <StatusPill status={isLive(user.lastSignedIn) ? "live" : "away"} />
                    </div>
                    <p className="skx-admin-person-meta">
                      {user.role === "admin" ? "Admin" : "Member"}
                      {` · ${user.filesGenerated ?? 0} files`}
                      {` · Joined ${formatDate(user.createdAt).toUpperCase()}`}
                      {` · Last seen ${lastSeenLabel(user.lastSignedIn)}`}
                    </p>
                    <p className="skx-admin-person-email">{user.email ?? "-"}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
