/**
 * Admin — the container.
 *
 * `components/admin/AdminView.tsx` is the screen and takes everything through props. This
 * file is where those props come from: the people and the four numbers from the admin
 * query, the invite links and the recent activity from the two trails the platform already
 * keeps. Rights are decided on the server, not here: `admin.userStats` answers "Access
 * Denied" to anyone who is not an admin, and that answer is what the page shows.
 */

import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@/lib/utils";
import { describeInviteUsage, inviteCodeStatus, sortCodesNewestFirst } from "@/lib/inviteCodes";
import { AdminDenied, AdminView, type AdminEvent, type AdminHealth, type AdminInvite, type AdminPerson, type AdminResource } from "@/components/admin/AdminView";

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
  const users = trpc.admin.userStats.useQuery(undefined, { retry: false });
  const codes = trpc.admin.betaInvites.listCodes.useQuery(undefined, { retry: false });
  const recent = trpc.audit.list.useQuery({ limit: 6, offset: 0 }, { retry: false });
  const auditStats = trpc.audit.getStats.useQuery(undefined, { retry: false });

  const headerActions = (
    <>
      <Link href="/admin/invites" className="btn">
        Invite links
      </Link>
      <Link href="/admin/audit-logs" className="btn">
        Audit logs
      </Link>
    </>
  );

  if (users.error) {
    return <AdminDenied message={users.error.message} actions={headerActions} />;
  }

  const list = users.data ?? [];
  const total = list.length;
  const admins = list.filter((u) => u.role === "admin").length;
  const filesTotal = list.reduce((acc, u) => acc + (u.filesGenerated || 0), 0);
  const onboarded = list.filter((u) => u.onboarded).length;
  const withFiles = list.filter((u) => (u.filesGenerated || 0) > 0).length;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const activeToday = list.filter((u) => new Date(u.lastSignedIn).getTime() >= startOfDay.getTime()).length;
  const share = (n: number) => (total > 0 ? n / total : 0);

  const people: AdminResource<AdminPerson[]> = users.isLoading
    ? { status: "loading" }
    : {
        status: "ready",
        data: list.map((user) => ({
          id: user.id,
          name: user.name ?? "-",
          email: user.email ?? "-",
          role: user.role === "admin" ? "Admin" : "Member",
          files: user.filesGenerated ?? 0,
          joined: formatDate(user.createdAt).toUpperCase(),
          lastSeen: lastSeenLabel(user.lastSignedIn),
          live: isLive(user.lastSignedIn),
        })),
      };

  const invites: AdminResource<AdminInvite[]> = codes.isLoading
    ? { status: "loading" }
    : codes.error
      ? { status: "error" }
      : {
          status: "ready",
          data: sortCodesNewestFirst(codes.data ?? []).map((code) => {
            const status = inviteCodeStatus(code);
            return {
              id: code.id,
              code: code.code,
              status: status.label,
              state: status.state,
              line: describeInviteUsage(code),
              when: `Made ${formatDate(code.createdAt)}${code.expiresAt ? ` · runs out ${formatDate(code.expiresAt)}` : ""}`,
            } satisfies AdminInvite;
          }),
        };

  const activity: AdminResource<AdminEvent[]> = recent.isLoading
    ? { status: "loading" }
    : recent.error
      ? { status: "error" }
      : {
          status: "ready",
          data: (recent.data?.logs ?? []).map((log) => ({
            id: log.id,
            when: new Date(log.createdAt).toLocaleString(),
            action: log.action,
            user: log.userId || "system",
            severity: log.severity || "info",
            ok: log.status !== "failure",
          })),
        };

  const health: AdminResource<AdminHealth | null> = auditStats.isLoading
    ? { status: "loading" }
    : auditStats.error
      ? { status: "error" }
      : {
          status: "ready",
          data: auditStats.data
            ? {
                events: auditStats.data.total,
                failures: auditStats.data.failures,
                critical: auditStats.data.critical,
                last24h: auditStats.data.last24h,
              }
            : null,
        };

  return (
    <AdminView
      foldKey="admin"
      stats={[
        { label: "Users", value: total.toLocaleString(), meter: share(onboarded), meterLabel: `${onboarded} of ${total} profiles set up` },
        { label: "Files", value: filesTotal.toLocaleString(), meter: share(withFiles), meterLabel: `${withFiles} of ${total} people have files` },
        { label: "Admins", value: admins.toLocaleString(), meter: share(admins), meterLabel: `${admins} of ${total} are admins` },
        { label: "Active today", value: activeToday.toLocaleString(), meter: share(activeToday), meterLabel: `${activeToday} of ${total} signed in today` },
      ]}
      people={people}
      invites={invites}
      activity={activity}
      health={health}
      actions={headerActions}
      onRetryPeople={() => users.refetch()}
      onRetryInvites={() => codes.refetch()}
      onRetryActivity={() => recent.refetch()}
      onRetryHealth={() => auditStats.refetch()}
    />
  );
}
