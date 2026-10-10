/**
 * /__lab/admin — the Admin screen in every state it can be in.
 *
 * Fixtures only (see `fixtures/lists.ts`): no login, no network, no refetch. The four
 * states are the ones the queries can return — data, loading, nobody signed up yet, and
 * the trail that failed to read.
 *
 * `?state=<name>` shows one state; with no `?state=` they stack for a scroll-through.
 * `?folds=open` forces every section open, because a closed fold renders no body at all.
 */
import { Link, useSearch } from "wouter";

import { ADMIN_FOLD_IDS, AdminDenied, AdminView } from "@/components/admin/AdminView";
import { cn } from "@/lib/utils";
import { ADMIN_STATE_NAMES, adminFixture, type AdminState } from "./fixtures/lists";
import { LabLayout } from "./LabLayout";

function useParams(): { state: AdminState | "all"; openAll: boolean } {
  const params = new URLSearchParams(useSearch());
  const raw = params.get("state");
  const state: AdminState | "all" = !raw ? "all" : (ADMIN_STATE_NAMES as string[]).includes(raw) ? (raw as AdminState) : "default";
  return { state, openAll: params.get("folds") === "open" };
}

export default function LabAdmin() {
  const { state, openAll } = useParams();
  const single = state !== "all";
  const body = (name: AdminState) => <AdminView {...adminFixture(name)} openSections={openAll ? ADMIN_FOLD_IDS : undefined} />;

  return (
    <LabLayout title="Admin">
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--quiet)" }}>
          Sample data — nothing here reads the server. The buttons and links do nothing.
        </p>

        <nav aria-label="Admin states" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Link href="/__lab/admin" className={cn("pill", !single && "is-active")}>
            All states
          </Link>
          {ADMIN_STATE_NAMES.map((name) => (
            <Link key={name} href={`/__lab/admin?state=${name}`} className={cn("pill", state === name && "is-active")}>
              {name}
            </Link>
          ))}
          <Link
            href={`/__lab/admin${single ? `?state=${state}&` : "?"}folds=open`}
            className={cn("pill", openAll && "is-active")}
          >
            folds open
          </Link>
        </nav>

        {single ? (
          body(state)
        ) : (
          <>
            {ADMIN_STATE_NAMES.map((name) => (
              <section key={name}>
                <h2 style={{ font: "700 18px/1 var(--disp)", margin: "0 0 12px" }}>{name}</h2>
                <div style={{ border: "1px dashed var(--stroke)", borderRadius: 16, overflow: "hidden" }}>{body(name)}</div>
              </section>
            ))}
            <section>
              <h2 style={{ font: "700 18px/1 var(--disp)", margin: "0 0 12px" }}>denied</h2>
              <div style={{ border: "1px dashed var(--stroke)", borderRadius: 16, overflow: "hidden" }}>
                <AdminDenied message="Admin access required" />
              </div>
            </section>
          </>
        )}
      </div>
    </LabLayout>
  );
}
