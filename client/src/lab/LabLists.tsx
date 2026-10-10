/**
 * /__lab/lists — the shared list-page pattern in every shape it takes.
 *
 * Connections, Skills, Memories, Monitors, Identity, Invites, Audit logs, More and Admin
 * are all built from these parts, so every one of them gets eyeballed here once: the head
 * with the Fold all pill, the search line, the stats strip, the row variants (picture,
 * avatar, icon, status, action, dimmed, link), the fold itself, and the loading, empty and
 * no-results states.
 *
 * Fixtures only (`fixtures/lists.ts`): no login, no network. Typing in the search works;
 * the buttons do nothing. `?folds=open` pins every section open; without it the page keeps
 * the real accordion — one open at a time on a phone.
 */
import { useState } from "react";
import { Link, useSearch } from "wouter";

import {
  ListEmpty,
  ListFold,
  ListFolds,
  ListPage,
  NoResults,
  Row,
  Rows,
  RowsSkeleton,
  SearchBar,
  StatStrip,
  forcedFolds,
  useListFolds,
} from "@/components/list";
import { cn } from "@/lib/utils";
import { LIST_ROWS, LIST_STRIP } from "./fixtures/lists";
import { LabLayout } from "./LabLayout";

const IDS = ["rows", "nest", "skeleton", "empty"];

export default function LabLists() {
  const params = new URLSearchParams(useSearch());
  const openAll = params.get("folds") === "open";
  const fold = forcedFolds(useListFolds("lab-lists", IDS), openAll ? IDS : undefined);
  const [query, setQuery] = useState("");
  const matched = LIST_ROWS.filter((row) => !query || String(row.title).toLowerCase().includes(query.toLowerCase()));

  return (
    <LabLayout title="List pages">
      <nav aria-label="List options" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        <Link href="/__lab/lists" className={cn("pill", !openAll && "is-active")}>
          real folds
        </Link>
        <Link href="/__lab/lists?folds=open" className={cn("pill", openAll && "is-active")}>
          folds open
        </Link>
      </nav>

      <ListPage
        title="Connections"
        lede="What Sutaeru can reach, and what it cannot."
        fold={fold}
        showFoldAll={!openAll}
        actions={
          <button type="button" className="btn">
            Add
          </button>
        }
      >
        <SearchBar
          value={query}
          onChange={setQuery}
          label="Search connections"
          placeholder="Search connections…"
          count={`${matched.length} / ${LIST_ROWS.length}`}
        />
        <StatStrip items={LIST_STRIP} />

        <ListFolds fold={fold}>
          <ListFold id="rows" index={1} fold={fold} label="Every row shape" pick={`${matched.length} shown`} mini={LIST_ROWS[0].art}>
            {matched.length === 0 ? (
              <NoResults query={query} onClear={() => setQuery("")} />
            ) : (
              <Rows label="Every row shape the pattern has">
                {matched.map((row, i) => (
                  <Row key={i} {...row} />
                ))}
              </Rows>
            )}
          </ListFold>

          <ListFold id="nest" index={2} fold={fold} label="A row with more under it" pick="briefings, sub-rows">
            <Rows label="Rows with extra content">
              <Row
                title="Indonesian nickel export policy"
                meta="WEEKLY 09:00 · 3 BRIEFINGS THIS WEEK"
                status={<span className="tag">Running</span>}
                icon="schedule"
              >
                <p className="lst-body">
                  What a monitor filed, or the sub-rows a page needs, sit under the row line inside the same row — not in a card of their own.
                </p>
              </Row>
            </Rows>
          </ListFold>

          <ListFold id="skeleton" index={3} fold={fold} label="Loading" pick="skeleton rows">
            <RowsSkeleton rows={3} />
          </ListFold>

          <ListFold id="empty" index={4} fold={fold} label="Empty" pick="nothing here yet">
            <ListEmpty title="Nothing connected yet." text="Add a connection and Sutaeru can work with it." icon="connections" action={<button type="button" className="btn">Add a connection</button>} />
          </ListFold>
        </ListFolds>
      </ListPage>
    </LabLayout>
  );
}
