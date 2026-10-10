/**
 * Admin — the presentational screen (components/list pattern).
 *
 * The four tall stat cards are one strip card, the people are rows, and everything the
 * owner only checks now and then (invite links, recent activity, the health numbers the
 * audit trail carries) is a fold, so the phone opens on the people and nothing else.
 *
 * Presentational only: the container is `client/src/pages/Admin.tsx`, which maps the tRPC
 * queries onto these props. Admin rights are decided on the server — when a query answers
 * "Access Denied" the container shows that and stops, exactly as before.
 */

import * as React from "react";
import type { ReactNode } from "react";

import { StatusPill } from "@/components/art";
import { ListEmpty, ListFold, ListFolds, ListPage, Row, Rows, RowsSkeleton, StatStrip, forcedFolds, useListFolds, type StripItem } from "@/components/list";
import { pickArt } from "@/lib/pickArt";

/** The three shapes every data card on this page can be in. */
export type AdminResource<T> = { status: "loading" } | { status: "error" } | { status: "ready"; data: T };

export interface AdminPerson {
  id: string | number;
  name: string;
  email: string;
  /** "Admin" or "Member". */
  role: string;
  files: number;
  /** Pre-formatted, upper case: "3 OCT 2026". */
  joined: string;
  /** Pre-formatted and short: "12 MIN", "YESTERDAY". */
  lastSeen: string;
  live: boolean;
}

export interface AdminInvite {
  id: string | number;
  code: string;
  /** "Not used yet", "Used", "Expired", "Switched off" — lib/inviteCodes. */
  status: string;
  /** The same reading as a key, so the row can dim itself without re-deriving it. */
  state: "open" | "used" | "expired" | "switchedOff";
  /** "nobody has used it yet" / "3 people used it". */
  line: string;
  /** "Made 3 Oct 2026". */
  when: string;
}

export interface AdminEvent {
  id: string | number;
  when: string;
  action: string;
  user: string;
  severity: string;
  ok: boolean;
}

export interface AdminHealth {
  events: number;
  failures: number;
  critical: number;
  last24h: number;
}

export interface AdminViewProps {
  stats: StripItem[];
  people: AdminResource<AdminPerson[]>;
  invites: AdminResource<AdminInvite[]>;
  activity: AdminResource<AdminEvent[]>;
  health: AdminResource<AdminHealth | null>;
  /** Header links: Audit logs, Invite links. The pages themselves re-check on the server. */
  actions?: ReactNode;
  onRetryPeople(): void;
  onRetryInvites(): void;
  onRetryActivity(): void;
  onRetryHealth(): void;
  foldKey?: string;
  /** Sections pinned open for the lab and the markup tests (a closed fold renders nothing). */
  openSections?: string[];
}

/** The admin sections, in page order. Each one is a fold. */
export const ADMIN_FOLD_IDS = ["people", "invites", "activity", "health"];

/** What the server's "Access Denied" answer looks like on this page. */
export function AdminDenied({ message, actions }: { message: string; actions?: ReactNode }) {
  return (
    <section className="view view-enter admin-view">
      <header className="head-row">
        <div>
          <h1 className="title lst-title">Admin</h1>
        </div>
        <div className="lst-actions">{actions}</div>
      </header>
      <p className="mono" style={{ margin: "26px 0 0" }}>
        Access Denied
      </p>
      <p className="lede" style={{ marginTop: 8 }}>
        {message}
      </p>
    </section>
  );
}

function Failed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="between">
      <p className="set-note">Couldn't load this right now.</p>
      <button type="button" className="btn" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function AdminView({
  stats,
  people,
  invites,
  activity,
  health,
  actions,
  onRetryPeople,
  onRetryInvites,
  onRetryActivity,
  onRetryHealth,
  foldKey,
  openSections,
}: AdminViewProps) {
  const fold = forcedFolds(useListFolds(foldKey ?? "admin", ADMIN_FOLD_IDS, { first: "people" }), openSections);

  const peopleRows = people.status === "ready" ? people.data : [];
  const inviteRows = invites.status === "ready" ? invites.data : [];
  const activityRows = activity.status === "ready" ? activity.data : [];
  const openInvite = inviteRows.filter((i) => i.state === "open" || i.state === "used").length;
  const healthData = health.status === "ready" ? health.data : null;

  return (
    <ListPage
      title="Admin"
      lede="Workspace health, people and activity."
      actions={actions}
      fold={fold}
      wide
      showFoldAll={!openSections}
      className="admin-view"
    >
      <StatStrip items={stats} />

      <ListFolds fold={fold}>
        <ListFold id="people" index={1} fold={fold} label="People" pick={people.status === "ready" ? `${peopleRows.length} in the workspace` : undefined} mini={pickArt("nav-agent")}>
          {people.status === "loading" && <RowsSkeleton rows={4} />}
          {people.status === "error" && <Failed onRetry={onRetryPeople} />}
          {people.status === "ready" &&
            (peopleRows.length === 0 ? (
              <ListEmpty title="No one signed up yet." text="People appear here the moment they create an account." icon="admin" />
            ) : (
              <Rows label="People">
                {peopleRows.map((person) => (
                  <Row
                    key={person.id}
                    title={person.name}
                    body={person.email}
                    meta={`${person.role} · ${person.files} ${person.files === 1 ? "file" : "files"} · Joined ${person.joined} · Last seen ${person.lastSeen}`}
                    initials={person.name.charAt(0).toUpperCase() || "-"}
                    status={<StatusPill status={person.live ? "live" : "away"} />}
                  />
                ))}
              </Rows>
            ))}
        </ListFold>

        <ListFold
          id="invites"
          index={2}
          fold={fold}
          label="Invite links"
          pick={invites.status === "ready" ? `${openInvite} open · ${inviteRows.length} made` : undefined}
          mini={pickArt("tone-friendly")}
        >
          {invites.status === "loading" && <RowsSkeleton rows={3} />}
          {invites.status === "error" && <Failed onRetry={onRetryInvites} />}
          {invites.status === "ready" &&
            (inviteRows.length === 0 ? (
              <ListEmpty title="No links yet." text="Make one on the Invite links page and send it to someone you trust." icon="share" />
            ) : (
              <Rows label="Invite links">
                {inviteRows.map((invite) => (
                  <Row
                    key={invite.id}
                    title={<span className="mono ink">{invite.code}</span>}
                    meta={`${invite.line} · ${invite.when}`}
                    quiet={invite.state === "expired" || invite.state === "switchedOff"}
                    status={<span className="tag">{invite.status}</span>}
                  />
                ))}
              </Rows>
            ))}
        </ListFold>

        <ListFold
          id="activity"
          index={3}
          fold={fold}
          label="Recent activity"
          pick={activity.status === "ready" ? `${activityRows.length} latest events` : undefined}
          mini={pickArt("depth-deep")}
        >
          {activity.status === "loading" && <RowsSkeleton rows={3} />}
          {activity.status === "error" && <Failed onRetry={onRetryActivity} />}
          {activity.status === "ready" &&
            (activityRows.length === 0 ? (
              <ListEmpty title="Nothing logged yet." text="Sign-ins and changes land here as they happen." icon="review" />
            ) : (
              <Rows label="Recent activity">
                {activityRows.map((event) => (
                  <Row
                    key={event.id}
                    title={<span className="mono ink">{event.action}</span>}
                    meta={`${event.user} · ${event.severity} · ${event.when}`}
                    quiet={!event.ok}
                    status={event.ok ? undefined : <span className="tag alert">Failed</span>}
                  />
                ))}
              </Rows>
            ))}
        </ListFold>

        <ListFold
          id="health"
          index={4}
          fold={fold}
          label="Health"
          pick={healthData ? (healthData.failures + healthData.critical > 0 ? `${healthData.failures} failed · ${healthData.critical} critical` : "No failures") : undefined}
          mini={pickArt("out-monitor")}
        >
          {health.status === "loading" && <RowsSkeleton rows={2} />}
          {health.status === "error" && <Failed onRetry={onRetryHealth} />}
          {health.status === "ready" &&
            (healthData ? (
              <Rows label="Health numbers">
                <Row title="Events logged" meta="Sign-ins and changes across the platform" status={<span className="mono ink tnum">{healthData.events}</span>} />
                <Row title="In the last 24 hours" meta="How much of the trail is recent" status={<span className="mono ink tnum">{healthData.last24h}</span>} />
                <Row
                  title="Failed"
                  meta="Requests that did not complete"
                  quiet={healthData.failures === 0}
                  status={<span className={healthData.failures ? "tag alert" : "tag quiet"}>{healthData.failures}</span>}
                />
                <Row
                  title="Critical"
                  meta="The ones to read first"
                  quiet={healthData.critical === 0}
                  status={<span className={healthData.critical ? "tag alert" : "tag quiet"}>{healthData.critical}</span>}
                />
              </Rows>
            ) : (
              <p className="set-note">No audit events yet.</p>
            ))}
        </ListFold>
      </ListFolds>
    </ListPage>
  );
}
