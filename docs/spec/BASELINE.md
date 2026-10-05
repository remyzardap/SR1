# Baseline (P1-01)

The reference every later work package is compared with: "no new failures against
`BASELINE.md`" (README §3) and the Phase 1 exit criteria (bench medians).

Recorded on 2026-10-05 from `develop` at `3480552` (before P1-01) and on the P1-01 branch
(after). Environment: the agent sandbox, Node 22.22.0 and npm 10.9.4, with no `.env`, no
provider keys and no Postgres server. CI uses Node 20, so the full suite and the typecheck were
also run with Node 20.20.2: same results.

## Typecheck

| When | Command | Result |
|---|---|---|
| Before P1-01 | `npm run check` (`tsc --noEmit`) | pass, 0 errors |
| After P1-01 | `npm run check` | pass, 0 errors |

`tsconfig.json` excludes `**/*.test.ts`, so test files are not typechecked.

## Tests

| When | Command | Files | Tests | Result |
|---|---|---:|---:|---|
| Before | `npm test` (`vitest run`; `vite.config.ts` sets `root: client`) | 2 | 30 | all pass, client tests only |
| Before | `npx vitest run --root . server` (what `npm test` never ran) | 128 | 1,749 | all pass, including `server/e2e.test.ts` (3 tests against the live site) |
| Before | `npm run test:e2e` | 0 | 0 | "No test files found", exit 1: with `root: client` the filter `server/e2e.test.ts` matched nothing |
| After | `npm test` (root `vitest.config.ts`) | 131 | 1,818 | all pass |
| After | `npx vitest run --root . server` | 129 | 1,788 | all pass (e2e and `*.db.test.ts` are excluded by the config) |
| After | `npm run test:e2e` (`vitest run --mode e2e`) | 1 | 3 | all pass (hits https://sutaeru.com) |
| After | `npm run test:db` without `TEST_DATABASE_URL` | 2 | 15 | all skipped, exit 0 |
| After | `npm run test:db` with a migrated scratch database | 2 | 15 | all pass (see below) |

Where the 1,818 come from: the 127 server test files that already existed besides the e2e test
(1,746 tests), 4 new cases in `server/core/jobs.audit.test.ts`, the new
`server/core/flags.test.ts` (24) and `server/core/kvCache.test.ts` (14), and the 2 client
files (30). There are no `shared/` tests yet.

### Failing tests

**None.** Nothing failed on `develop` before P1-01 and nothing fails after it, so there is no
known-failure list: from here on any failing test in `npm test` is a regression.

### Database tests

`*.db.test.ts` run only through `npm run test:db` and skip when `TEST_DATABASE_URL` is unset:
`server/migrate.db.test.ts` (5 tests) and `server/core/kvCache.db.test.ts` (10 tests).

- **CI:** the `db-tests` job runs them against `pgvector/pgvector:pg16` after `npm run migrate`.
  It is `continue-on-error` until Phase 2. Its first result appears on the P1-01 pull request.
- **Sandbox:** no Postgres server or Docker could run here, so they were run against PGlite
  0.5.8 (Postgres 18.3 compiled to wasm) behind `pglite-socket`, after `npm run migrate`:
  15 of 15 pass, on Node 22 and Node 20.

### Migration 0025 applies twice (AC3)

On the scratch database above:

1. Fresh database: `npm run migrate` twice. Both runs pass, and 0025 is recorded once.
2. `psql -v ON_ERROR_STOP=1 -f drizzle/migrations/0025_phase1_core.sql`, twice more. Exit 0
   both times, each statement answering "already exists, skipping".
3. Upgrade path: a database migrated with `develop`'s files (bootstrap, 0015 to 0024) and holding
   a `chat_messages` row, then this branch's `npm run migrate`. 0025 applies, and the old row
   reads `metadata = {}`.
4. `server/migrate.db.test.ts` "applies twice in a row without error" repeats this in CI on pg16.

## Bench

**Pending: the owner runs `npm run bench -- --runs 3`.** The bench calls the real model and search
providers, and needs `.env`, the provider keys, a database with `usage_logs` and a user, none of
which exist in the agent sandbox. It refuses to start without them.

Run it once from `develop` with P1-01 merged and all flags at their defaults:

1. In the `.env` used by the app (on the VPS: `/root/sr1/.env`), check that the provider keys and
   `DATABASE_URL` are set, set `EVAL_USER_ID` to the account the bench should run as (the eval
   account, 199 by default for `eval:research`), and add that id to `KEMMA_UNLIMITED_USER_IDS`
   so the daily quota doesn't stop the 36 runs.
2. On the VPS host, outside docker, also set `EVAL_DB_HOST` to the Postgres container's IP
   (as for `npm run eval:research`).
3. Run `npm run bench -- --runs 3`. It takes several minutes (12 prompts × 3 runs, one at a time).
4. Paste the tables from stdout below, replacing the pending rows, and commit
   `evals/results/bench-<date>.json` with them.

Each cell is the median of the successful runs. TTFT is the first streamed token; first activity
is the first step start, tool start, notice or token. Tokens and cost come from the
`usage_logs` rows the run wrote. Each prompt runs with the tools production offers its chat
mode (`defaultToolSet(mode)` in `server/kemma/settings.ts`, which `/api/kemma/stream` applies
through `resolveSettings`): `fast` offers `web_search` only, `deep` adds `browse` and `run_code`.

| Prompt | Category | Mode | OK | TTFT ms | First activity ms | Total ms | Tools | LLM calls | Input tok | Output tok | Cost USD | Answer chars |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| chat-1 | chit-chat | fast | pending | | | | | | | | | |
| chat-2 | chit-chat | fast | pending | | | | | | | | | |
| chat-3 | chit-chat | fast | pending | | | | | | | | | |
| lookup-1 | single-lookup | fast | pending | | | | | | | | | |
| lookup-2 | single-lookup | fast | pending | | | | | | | | | |
| lookup-3 | single-lookup | fast | pending | | | | | | | | | |
| research-1 | multi-search | fast | pending | | | | | | | | | |
| research-2 | multi-search | fast | pending | | | | | | | | | |
| research-3 | multi-search | fast | pending | | | | | | | | | |
| read-1 | read-url | deep | pending | | | | | | | | | |
| read-2 | read-url | deep | pending | | | | | | | | | |
| report-1 | long-report | deep | pending | | | | | | | | | |

The bench also prints a per-category table (the medians later acceptance criteria use, such as
TTFT on research prompts and total time on the multi-search prompts) and a per-tool latency table
(`web_search`, `browse`).

### What the bench numbers do and don't include

- **Search cost isn't in them.** `web_search` runs a Sonar call (`server/kemma/executors/webSearch.ts`)
  that writes no `usage_logs` row, so the cost column covers model calls only. P1-08 AC2 compares
  cost per search with "the Sonar baseline in `BASELINE.md`": that baseline has to come from the
  Sonar price and the per-tool call counts here, or from P1-08's own usage rows with
  `FF_SEARCH_V2` off.
- **Searches aren't cached.** The bench sets `KEMMA_SEARCH_CACHE_TTL_SEC=0` for its process, so
  runs 2 and 3 repeat real searches instead of reading the in-process cache. Pass `--cache` to
  measure with the cache.
- The bench passes `onStream`, as the chat route does, so complex prompts take the main loop and
  not the parallel sub-agent path (which only runs without `onStream`).
- A run over 10 minutes counts as failed; until P1-05 the engine keeps working in the
  background, and its late usage rows are not counted.
