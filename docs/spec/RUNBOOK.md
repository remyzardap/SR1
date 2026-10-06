# Runbook: from today to the end of Phase 4

This is the master schedule. Follow it top to bottom. It says **what to start, in what order, how many agents at once, what must be true before each step, what must be true after it, and what the human owner has to do along the way.**

Read `HANDOVER.md` first (rules, the per-package routine, codebase traps). This file does not repeat those. It sequences them.

Status legend used in the tracker: `[ ]` not started · `[~]` in progress · `[x]` merged into `develop`.

---

## 0. Ground rules for running the whole program

### 0.1 Concurrency cap
**At most 3 agents working at the same time.** More than that causes merge conflicts faster than reviews can clear them. Within a wave below, if it lists more than 3 packages, start 3, and start the next as each one is merged.

### 0.2 One reviewer, one merge queue
- Every pull request goes into `develop` and is reviewed against its spec section and `README.md` §5 (gates R1 to R10).
- **Merge one pull request at a time.** After each merge, every other open branch must pull `develop` in before it is merged (see 0.4).
- Nothing is merged on red CI. Nothing is merged with a scope gate failing, even if the code is good.

### 0.3 Never run these in parallel
Packages that edit the same core file must be merged in order, even if the dependency map says they could start together. The pairs that collide:

| Files | Packages (merge in this order) |
|---|---|
| `server/kemma/engine.ts` tool loop | P1-02 → P1-03 → P1-04 → P1-05 → P1-13 |
| `server/kemma/tools.ts`, `kemmaMax.ts` | P1-02 first; P1-08 and P1-09 only add optional fields |
| `server/routes/kemmaStream.ts` | P1-03 → P1-04 → P1-07 → P1-11 → P2-12 → P3-01 |
| `server/kemma/settings.ts`, `server/core/kemmaRouter.ts` | P1-06 → P2-08 → P2-09 |
| `drizzle/schema.ts` and migrations | only the first package of each phase adds migrations (P2-01, P3-01, P4-01) |

### 0.4 When another package merges first
The agent whose branch is behind does this, on its own branch:

```bash
git fetch origin develop
git merge origin/develop          # a merge commit, never a rebase, never a force-push
# resolve conflicts: keep BOTH sides' intent; if both changed the same logic, stop and ask
npm ci && npm run check && npm test
git push
```

### 0.5 Escalation: when to stop and ask the owner
Stop the whole queue, and report, if any of these happen:
- `develop` itself fails `npm run check` or `npm test` (someone merged something red).
- A package needs a key, a container change, or a decision that is not listed in §6.
- Two packages need the same file in incompatible ways.
- An agent says a spec step is impossible.
- Anything touches `.env`, `secrets/`, or `deploy.yml`.

### 0.6 What "merged" means
Squash-merge into `develop` with the title `[<WP-ID>] <title> (#<PR number>)`. Then tick the box in §2.

---

## 1. The prompt to give an agent (copy, fill the two blanks)

```
You are implementing work package <WP-ID> in the Sutaeru repository.

Read first, fully, in this order:
  1. docs/spec/HANDOVER.md        (the routine you must follow and the hard rules)
  2. docs/spec/README.md          (§3 rules, §5.3 the pull request template)
  3. docs/spec/PHASE-<n>.md       (find the section "<WP-ID>": this is your spec)
  4. Every file listed under "Files" in that section, plus the tests beside them.

Branch: wp/<WP-ID>-<slug>, created from origin/develop.
Pull request: base develop, title "[<WP-ID>] <title>", body from README §5.3.

Before you start, run `npm ci && npm run check && npm test`. If either fails, stop and report.
Do exactly what the spec says. Do not touch files outside the spec's list without a written reason.
Do not weaken or skip any test. New behavior goes behind a flag that defaults to off.
When done, run `npm run check && npm test`, re-read your own diff, push, open the PR, then stop.

If anything in the spec is wrong or impossible, stop and say so. Do not improvise a different design.
```

Slugs: see the tracker in §2.

---

## 2. The tracker

Branch names are `wp/<ID>-<slug>`. Size: S ≈ 1 day, M ≈ 2–3, L ≈ 4–6 (agent time, including review rounds).

### Phase 1 (13 packages)

| | ID | Slug | Size | Needs merged first | Wave |
|---|---|---|---|---|---|
| [x] | P1-01 | `ci-baseline` | M | — | done |
| [ ] | P1-02 | `tool-runtime` | L | P1-01 | 1.A |
| [ ] | P1-08 | `search-providers` | L | P1-01 | 1.A |
| [ ] | P1-09 | `tiered-reader` | L | P1-01 | 1.A |
| [ ] | P1-03 | `stream-all-turns` | L | P1-02 | 1.B |
| [ ] | P1-10 | `untrusted-fencing` | S | P1-02 | 1.B |
| [ ] | P1-04 | `parallel-tools` | M | P1-02, P1-03 | 1.C |
| [ ] | P1-06 | `output-length` | S | P1-03 | 1.C |
| [ ] | P1-07 | `stable-citations` | M | P1-03 | 1.C |
| [ ] | P1-05 | `cancellation` | M | P1-03, P1-04 | 1.D |
| [ ] | P1-11 | `approvals` | L | P1-02, P1-04 | 1.D |
| [ ] | P1-13 | `context-manager` | L | P1-02, P1-05 | 1.E |
| [ ] | P1-12 | `action-tools` | M | P1-11 | 1.E |

### Phase 2 (12 packages)

| | ID | Slug | Size | Needs merged first | Wave |
|---|---|---|---|---|---|
| [ ] | P2-01 | `pgvector-schema` | M | Phase 1 gate | 2.A |
| [ ] | P2-11 | `persistent-sandbox` | M | Phase 1 gate | 2.A |
| [ ] | P2-02 | `embeddings` | M | P2-01 | 2.B |
| [ ] | P2-06 | `document-parsing` | L | P2-01 | 2.B |
| [ ] | P2-08 | `model-registry` | M | P2-01 | 2.B |
| [ ] | P2-03 | `hybrid-retrieval` | M | P2-02 | 2.C |
| [ ] | P2-09 | `modes-router` | L | P2-08 | 2.C |
| [ ] | P2-10 | `native-multimodal` | M | P2-08 | 2.C |
| [ ] | P2-04 | `memory-v2` | L | P2-03 | 2.D |
| [ ] | P2-05 | `conversation-search` | S | P2-03 | 2.D |
| [ ] | P2-07 | `file-retrieval` | M | P2-03, P2-06 | 2.D |
| [ ] | P2-12 | `one-engine` | L | P2-09 | 2.E |

### Phase 3 (12 packages)

| | ID | Slug | Size | Needs merged first | Wave |
|---|---|---|---|---|---|
| [ ] | P3-01 | `durable-runs` | L | Phase 2 gate | 3.A |
| [ ] | P3-02 | `background-runs` | M | P3-01 | 3.B |
| [ ] | P3-03 | `plan-tool` | S | P3-01 | 3.B |
| [ ] | P3-04 | `deep-research-v2` | L | P3-01 | 3.B |
| [ ] | P3-05 | `realtime-voice` | L | P3-01 | 3.C |
| [ ] | P3-07 | `user-connectors` | L | P3-01 | 3.C |
| [ ] | P3-09 | `custom-agents` | L | P3-01 | 3.C |
| [ ] | P3-06 | `meetings` | M | P3-05 | 3.D |
| [ ] | P3-08 | `kemma-mcp-server` | M | P3-07 | 3.D |
| [ ] | P3-10 | `byok` | M | P3-01 | 3.D |
| [ ] | P3-11 | `media-v2` | M | Phase 2 gate | 3.E |
| [ ] | P3-12 | `channels` | M | P2-12 | 3.E |

### Phase 4 (9 packages)

| | ID | Slug | Size | Needs merged first | Wave |
|---|---|---|---|---|---|
| [ ] | P4-01 | `schema-logging` | M | Phase 2 gate | 4.A |
| [ ] | P4-02 | `tracing` | M | P4-01 | 4.B |
| [ ] | P4-03 | `cost-truth` | M | P4-01 | 4.B |
| [ ] | P4-07 | `safety` | M | P4-01 | 4.B |
| [ ] | P4-04 | `credits` | L | P4-03 | 4.C |
| [ ] | P4-05 | `evals-ci` | L | P4-02 | 4.C |
| [ ] | P4-08 | `reliability` | M | P4-01 | 4.C |
| [ ] | P4-06 | `feedback-loop` | S | P4-02 | 4.D |
| [ ] | P4-09 | `performance` | M | P4-02 | 4.D |

Note: P4-01 and P4-02 may be started during Phase 3 (they only need Phase 2 done).

---

## 3. Phase 1: fix the fundamentals

**Owner prep before Wave 1.A** (does not block starting; blocks proving the targets):
- Run the benchmark baseline once on the VPS. Steps: `HANDOVER.md` §9. Paste the result into `BASELINE.md`.
- Create accounts and keys for search: Brave Search API key, Tavily API key. Put them in `.env`, not in git: `BRAVE_SEARCH_API_KEY`, `TAVILY_API_KEY`. Optional: `JINA_API_KEY`.

### Wave 1.A (start now): 3 agents in parallel
**P1-02 tool runtime · P1-08 search providers · P1-09 tiered reader**

- Entry: `develop` is green (it is, at `d578f24`).
- P1-08 and P1-09 only *add* optional fields to the tool definitions in `tools.ts` and pass them through `kemmaMax.ts`. P1-02 rewrites those files. Merge **P1-02 first**; P1-08 and P1-09 then pull `develop` in (0.4) and re-resolve the small overlap.
- Exit: all three merged; `npm run check` and `npm test` green on `develop`.

### Wave 1.B: 2 agents
**P1-03 streaming · P1-10 untrusted fencing**

- Entry: P1-02 merged.
- P1-03 edits the model-call and loop code in `engine.ts`; P1-10 edits only the single place where tool results are pushed into the message list. Merge **P1-03 first**.
- Exit: with `FF_STREAM_TOOL_TURNS=1`, text appears on tool turns (P1-03's tests prove it); with `FF_UNTRUSTED_FENCING` on (default), a fenced result appears in the model's messages.

### Wave 1.C: 3 agents
**P1-04 parallel tools · P1-06 output length · P1-07 stable citations**

- Entry: P1-03 merged (P1-04 also needs P1-02, already done).
- Order of merges: **P1-04, then P1-06, then P1-07.** P1-04 rewrites the tool loop; P1-06 touches `callLLM` and the token limits table; P1-07 touches `sources.ts`, the stream route and `db.ts`.
- Exit: three flags exist and work (`PARALLEL_TOOLS`, `AUTO_CONTINUE`; citations has none, it is a bug fix).

### Wave 1.D: 2 agents
**P1-05 cancellation · P1-11 approvals**

- Entry: P1-04 merged.
- Merge **P1-05 first** (it threads a signal through the same loop P1-04 just changed), then P1-11.
- **Owner action:** none, but P1-11's pull request body must include screenshots of the approval card. Review them; they are the only proof of the user-facing part.

### Wave 1.E: 2 agents
**P1-13 context manager · P1-12 action tools**

- Entry: P1-05 merged (P1-13); P1-11 merged (P1-12).
- Independent files; merge in either order.

### Phase 1 gate (owner + reviewer together)

1. On `develop`, run the benchmark with every Phase 1 flag on: `FF_STREAM_TOOL_TURNS=1 FF_PARALLEL_TOOLS=1 FF_AUTO_CONTINUE=1 FF_SEARCH_V2=1 FF_READER_V2=1 FF_CONTEXT_MANAGER=1 FF_APPROVALS=1 FF_ACTION_TOOLS=1 npm run bench -- --runs 3`.
2. Compare to `BASELINE.md` against the exit table at the bottom of `PHASE-1.md`. Record both in `BASELINE.md`.
3. Run `npm run eval:research`; it must not drop more than 3 points.
4. If all targets are met: merge `develop` into `main`. This deploys. **All flags stay off in production at first.**
5. Turn flags on in production **one at a time**, a few days apart, in this order, watching cost and errors between each:
   `STREAM_TOOL_TURNS` → `PARALLEL_TOOLS` → `SEARCH_V2` → `READER_V2` → `AUTO_CONTINUE` → `CONTEXT_MANAGER` → `APPROVALS` + `ACTION_TOOLS`.
6. Rollback for any problem: set that flag to `0` and restart the app. No code change needed.

---

## 4. Phase 2: memory, files, options

**Owner prep before Wave 2.A (this one blocks P2-01):**
- Decide **D4**: where Postgres runs. If it is the compose container on the VPS, follow the runbook P2-01 will write in `ops/postgres/README.md`: back up, rebuild the database image with pgvector, restart, check. **Agents never do this; you do.** If it is a managed database, run `CREATE EXTENSION vector;` in the provider's console.
- Decide **D6/D7** (LiteLLM gateway for Claude and GPT models; embedding model). Defaults in `README.md` §6 are fine.
- Keys as chosen: gateway key, reranker key (optional).

### Wave 2.A: 2 agents
**P2-01 pgvector and Phase 2 schema · P2-11 persistent sandbox**

- Entry: Phase 1 gate passed.
- P2-01 owns the Phase 2 migration. P2-11 adds none.
- Exit: both database variants (with and without pgvector) migrate in CI. **Owner then performs the database image change** and confirms with `SELECT extname FROM pg_extension`.

### Wave 2.B: 3 agents
**P2-02 embeddings · P2-06 document parsing · P2-08 model registry**

- Entry: P2-01 merged **and** the owner's database change done (P2-02 needs it for real tests).
- Merge in any order; they touch different areas.
- Owner prep: if using Docling for PDFs, start the Docling Serve sidecar (a container change, owner only) and set `DOCLING_URL`; otherwise set `OCR_PROVIDER=vision` and skip it.

### Wave 2.C: 3 agents
**P2-03 hybrid retrieval · P2-09 modes and router · P2-10 native multimodal**

- Entry: P2-02 (for P2-03), P2-08 (for P2-09, P2-10).
- Merge **P2-09 before P2-10** (both touch the engine's message and model selection).
- P2-09 needs labelled data for its accuracy check (`evals/router/`): the agent builds the 40-message set; the reviewer reads it and corrects labels before approving.

### Wave 2.D: 3 agents
**P2-04 memory v2 · P2-05 conversation search · P2-07 file retrieval**

- Entry: P2-03 merged (P2-07 also needs P2-06).
- P2-04 ships an eval (`evals/memory/`). Run it for real (needs keys). Targets: recall ≥ 85%, stale answers ≤ 5%, duplicates ≤ 5%.
- **Owner action:** run the embeddings backfill once (`npm run jobs:backfill-embeddings`) after P2-02 and P2-04 are live.

### Wave 2.E: 1 agent
**P2-12 one engine for every channel**

- Entry: P2-09 merged.
- This retires old chat routes. They return `410 Gone` for one release and count hits. **Do not delete the old code in this package.** A later cleanup removes it after two weeks of zero hits.
- Reviewer checks: Telegram and WhatsApp audit tests were updated, not deleted.

### Phase 2 gate
Targets from the table at the bottom of `PHASE-2.md`. Merge `develop` into `main`. Flags on in production in this order: `FF_USER_MODEL_PICKER` after the registry is verified, the memory features, `FF_CONVERSATION_SEARCH`. The mode router starts in shadow: log its choice without acting on it for a few days, then switch it on.

---

## 5. Phase 3: what sets it apart

**Owner prep before Wave 3.A:**
- Set `DATA_ENCRYPTION_KEY` (32 random bytes, base64) in `.env`. Keep a copy somewhere safe: losing it makes every stored connector token and user API key unreadable.

### Wave 3.A: 1 agent
**P3-01 durable runs** (the foundation: it also owns the Phase 3 database changes)

- Entry: Phase 2 gate passed.
- This is the riskiest package of the program. Reviewer must run the crash test personally: kill the process mid-run, restart, confirm no tool ran twice.

### Wave 3.B: 3 agents
**P3-02 background runs and notifications · P3-03 plan tool · P3-04 deep research v2**

- Owner prep: generate VAPID keys for web push (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`); academic APIs need no key except an optional `S2_API_KEY`.
- P3-04 includes a real evaluation. Run it with real keys; targets: citation precision ≥ 0.90, accuracy ≥ Phase 2 score + 10 points.

### Wave 3.C: 3 agents
**P3-05 realtime voice · P3-07 per-user connectors · P3-09 custom agents**

- Owner prep for voice: Deepgram key (or the self-hosted alternatives) and the ElevenLabs settings you already have. For connectors, verify each vendor's MCP URL and OAuth support (the agent will list which ones it could and could not verify).
- P3-05 is only accepted with measured latency: end-to-end p50 ≤ 1.2 s over 30 turns, run on the VPS.

### Wave 3.D: 3 agents
**P3-06 meetings · P3-08 Kemma as an MCP server · P3-10 bring your own key**

- Entry: P3-05 (for P3-06), P3-07 (for P3-08).
- P3-10 needs extra review attention: an invalid key must be rejected on save, and a key must never appear in a log. The reviewer deliberately forces a provider error that echoes the key and checks.

### Wave 3.E: 2 agents
**P3-11 media v2 · P3-12 channels (Slack, Discord, email-in)**

- Owner prep: `FAL_KEY`; for channels, create the Slack app, the Discord bot and the inbound email route, then set their signing secrets in `.env`. These are third-party consoles only you can access.

### Phase 3 gate
Targets from the table at the bottom of `PHASE-3.md`. Merge to `main`. Roll out flags one at a time. Voice and BYOK go to a small group first.

---

## 6. Phase 4: quality engine

**Owner prep before Wave 4.A:** decide D9 (tracing backend; recommended self-hosted Langfuse in compose, a container change you perform) and D10 (monthly budget for evals).

### Wave 4.A: 1 agent
**P4-01 schema and structured logging**
- The logging change touches many files. It must be done one directory per commit so the diff is reviewable. Reject a single giant commit.

### Wave 4.B: 3 agents
**P4-02 tracing · P4-03 cost truth · P4-07 safety**
- P4-03 includes a reconciliation script. Owner supplies one month of provider invoices or exports in `ops/costs/` to verify drift ≤ 10%.

### Wave 4.C: 3 agents
**P4-04 credits · P4-05 evals in CI · P4-08 reliability**
- P4-04 changes billing. Behind `FF_CREDITS`, off until the owner has set the tier numbers and run the opening-balance migration script.
- P4-08 includes a **backup and restore drill**. The owner runs it once and records the date.

### Wave 4.D: 2 agents
**P4-06 feedback loop · P4-09 performance**

### Phase 4 gate and then the steady state
Targets from the table at the bottom of `PHASE-4.md`. After the gate, follow the "Operating rhythm" section in `PHASE-4.md`: daily digest, weekly review of feedback and router results, monthly cost reconciliation and backup spot check.

---

## 7. What the owner needs to provide, in order

| When | What | For |
|---|---|---|
| Now | Benchmark baseline run (`npm run bench -- --runs 3`) | Proving every Phase 1 target |
| Before 1.A merges | `BRAVE_SEARCH_API_KEY`, `TAVILY_API_KEY`, optional `JINA_API_KEY` | P1-08, P1-09 |
| Phase 1 gate | Turn flags on one at a time in production | Rollout |
| Before 2.A | Decisions D4, D6, D7; gateway key | Phase 2 |
| After P2-01 | **Database image change (pgvector)**, then confirm | P2-02 onward |
| Before 2.B | Docling sidecar or `OCR_PROVIDER=vision` | P2-06 |
| After P2-04 | Run `npm run jobs:backfill-embeddings` | Memory search |
| Before 3.A | `DATA_ENCRYPTION_KEY` (and back it up) | P3-01, P3-07, P3-10 |
| Before 3.B | VAPID keys | P3-02 |
| Before 3.C | Deepgram key; verify connector URLs | P3-05, P3-07 |
| Before 3.E | `FAL_KEY`; Slack app, Discord bot, inbound email route and secrets | P3-11, P3-12 |
| Before 4.A | Decisions D9, D10; Langfuse container | P4-02, P4-05 |
| During 4.B | One month of provider invoices in `ops/costs/` | P4-03 |
| During 4.C | Credit tier numbers; backup and restore drill | P4-04, P4-08 |

## 8. Checklist for the reviewer, per pull request (short form)

Full rubric is `README.md` §5. In order:

1. CI green on the **latest** commit (not an earlier one).
2. The changed-file list matches the spec's "Files" list; every extra file is explained.
3. Each acceptance criterion in the PR body has evidence (a test name, command output, a number), not just "done".
4. Run `npm run check && npm test` yourself. Test count did not go down.
5. Read the tests. Do they fail if the key line is removed? Do they cover failure paths?
6. Search the diff for: module-level `process.env`, logging of bodies or keys, a deleted or skipped test, a new tool that could delete or share a file.
7. Any migration: additive, idempotent, journaled, mirrored in `schema.ts`.
8. New behavior behind a flag that defaults to off, and with the flag off the old behavior is unchanged.
9. New env vars appear in `ENVIRONMENT_VARIABLES.md` and `.env.example`.
10. Verdict: approve, changes requested (numbered list), or reject (approach is wrong).

## 9. If things go wrong

| Problem | What to do |
|---|---|
| A flag turned on in production causes errors | Set `FF_<NAME>=0`, restart. Investigate on `develop`. |
| A merged package breaks `develop` | Revert that squash commit on `develop` (one commit, easy), reopen the package. |
| An agent keeps failing the same review point | Stop it. Rewrite that part of the spec more explicitly, then restart with a fresh agent. |
| Two agents conflict repeatedly | Serialize them: finish one, merge, then start the other. |
| A provider changes its API | The package's adapter is isolated; fix only that adapter. The spec marks which docs each adapter was built from. |
| Cost spikes | Check `usage_logs` by `purpose`; turn off the newest flag; look for a missing spend cap. |
| Out of time or budget | Stop at any gate. Each gate leaves `main` working and the flags off. Nothing is half-shipped. |
