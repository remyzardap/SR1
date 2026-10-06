# Handover: how to continue this build

Read this file first, all of it, before touching anything. The end goal is in `END_GOAL.md`; how agents are dispatched on the VPS is in `AGENT_OPS.md`. It is written for a coding agent picking up work with no memory of what came before.

If you only remember three things:

1. **One work package per branch and per pull request.** Never two.
2. **`npm run check` and `npm test` must both pass before you push.** No exceptions.
3. **When the spec and your instinct disagree, the spec wins.** If the spec looks wrong, stop and say so in the pull request instead of improvising.

---

## 1. What this project is, in four sentences

Sutaeru is an AI agent chat product. The backend lives in `server/`, the React client in `client/`, the database schema in `drizzle/`. The agent is called Kemma; its brain is `server/kemma/engine.ts`, which loops: call a model, run the tools the model asked for, repeat, answer.

You are implementing a 46-step plan to make that agent faster, cheaper and more capable, without breaking what works.

## 2. Where things stand right now

| | |
|---|---|
| Integration branch | **`develop`** at `36686a3` — start every branch from here |
| Deploy branch | `main` — **pushing to `main` deploys to the live server**, so never target it |
| Done | **P1-01** (CI, test wiring, feature flags, benchmark script, Phase 1 database tables) |
| Not started | **P1-02 through P1-13**, then Phases 2, 3 and 4 |
| Open pull request | **#3** (the plan and spec, into `main`) — green, waiting for the owner to merge |
| Owner to-do | run the benchmark once on the server for baseline numbers (see §9) |

Nothing else is in flight. Three agents were working on P1-02, P1-08 and P1-09 and were stopped before pushing anything, so those three are untouched and free to claim.

## 3. The documents, and which one answers what

| Question | File |
|---|---|
| What are the rules I must follow? | `docs/spec/README.md` §3 |
| What exactly do I build for my work package? | `docs/spec/PHASE-1.md` … `PHASE-4.md`, find your ID |
| Which packages can run at the same time? | `docs/spec/README.md` §8 |
| How will my pull request be judged? | `docs/spec/README.md` §5 |
| What did the test suite look like before? | `docs/spec/BASELINE.md` |
| Why does any of this matter? | `BACKEND_UPGRADE_PLAN.md` (background only) |

## 4. Do this, in order, every time

### Step 1 — Pick one work package

Go in the order in §5 below. Take the first unclaimed one whose prerequisites are merged into `develop`.

### Step 2 — Set up

```bash
cd /path/to/SR1
git fetch origin develop
git checkout -B wp/<WP-ID>-<short-slug> origin/develop   # e.g. wp/P1-02-tool-runtime
npm ci
```

### Step 3 — Prove the starting point is healthy

```bash
npm run check    # must print no errors
npm test         # must say 131 passed, 1818 passed (or more, if packages merged since)
```

If either fails **before you change anything**, stop. Do not start work. Report it: something is wrong with `develop`, not with you.

### Step 4 — Read

- Your work package's section, start to finish.
- Every file listed under **Files** in it.
- The existing tests for those files (`*.test.ts` next to them). They tell you what must keep working.

### Step 5 — Build it

Follow the spec section literally. It gives you the file paths, the type definitions, the database changes, the environment variables and the tests to write. Work in small commits.

### Step 6 — Prove it works

```bash
npm run check
npm test
```

Both must pass. If a test that passed in Step 3 now fails, **you broke it** — fix your code. Do not delete the test, do not skip it, do not mark it `todo`. That is an automatic rejection.

### Step 7 — Re-read your own diff, looking for trouble

```bash
git diff origin/develop...HEAD
```

Ask yourself, line by line:
- Did I touch a file my work package doesn't list? If yes, I must explain why in the pull request.
- Did I read an environment variable at the top of a file instead of inside a function? (See §7, rule 3.)
- Did I log anything that could contain an API key, a user's file contents or a provider's raw response?
- Would this work on Node 20? (CI uses Node 20; your machine may have something newer.)

### Step 8 — Push

```bash
git push -u origin wp/<WP-ID>-<short-slug>
```

If the push fails for network reasons, wait 2 seconds and retry, then 4, then 8, then 16. Do not force-push.

### Step 9 — Open the pull request

- **Base: `develop`.** Never `main`.
- **Title:** `[<WP-ID>] <the work package's title>`
- **Body:** fill in the template in `docs/spec/README.md` §5.3. Every acceptance criterion needs evidence next to it: a test name, a command's output, a number. "Done" on its own is not evidence.

### Step 10 — Stop

Do not start the next work package in the same branch. Wait for review. When changes are requested, fix them on the same branch and push again; the pull request updates itself.

## 5. The order to work in

**Phase 1 remaining.** P1-02 first: it changes how every tool is defined, so doing it later means redoing work.

| Order | ID | What it does | Needs merged first |
|---|---|---|---|
| 1 | **P1-02** | Rebuild all agent tools on one typed foundation | — |
| 2 | **P1-03** | Stream the answer on every turn, not just tool-free ones | P1-02 |
| 3 | **P1-04** | Run independent tool calls at the same time | P1-02, P1-03 |
| 4 | **P1-05** | Actually stop work when the user cancels | P1-03 |
| 5 | **P1-06** | Longer answers, and continue if cut off | P1-03 |
| 6 | **P1-07** | Fix citation numbers; save sources with the message | P1-03 |
| 7 | **P1-13** | Keep long chats inside the model's limit | P1-02, P1-05 |
| any time | **P1-08** | New search providers (replaces the costly Sonar call) | — |
| any time | **P1-09** | New page reader (replaces the slow browser agent) | — |
| any time | **P1-10** | Mark web and file content as untrusted data | P1-02 |
| after P1-04 | **P1-11** | Ask the user before sending email and similar actions | P1-02, P1-04 |
| after P1-11 | **P1-12** | Give the agent email, calendar, image, video, monitor tools | P1-11 |

P1-08 and P1-09 are self-contained and can be done by a separate agent in parallel with the P1-02 chain at any point.

Then Phase 1's exit criteria at the end of `PHASE-1.md`, then Phase 2 starting with P2-01.

## 6. If two agents work at once

Only run parallel agents on packages in different lanes (`README.md` §8). Even then:

- **`server/kemma/tools.ts` and `server/kemma/kemmaMax.ts` are the collision risk.** Several packages touch them.
- If your package is not P1-02, only **add** optional fields to existing tool definitions in those two files. Do not restructure them. P1-02 is rewriting them, and small additions re-merge cleanly while restructures do not.
- Put genuinely new code in a new folder (`server/kemma/search/`, `server/kemma/reader/`) and switch to it from the existing function behind a feature flag. That way, two packages barely touch the same lines.

## 7. Hard rules

Breaking any of these gets the pull request rejected, however good the rest is.

1. **Stay inside your work package.** No tidying up unrelated code, no renaming things, no reformatting files, no upgrading dependencies to new major versions. A reviewer compares your changed-file list against the spec's.
2. **Never weaken a test.** Not deleted, not skipped, not loosened so it passes. If a test is genuinely wrong, say so in the pull request and leave it failing.
3. **Read environment variables inside functions, not at the top of a file.** Secrets arrive after the code loads, so `const KEY = process.env.FOO` at module level captures an empty value forever. Write `function key() { return process.env.FOO ?? ""; }` instead. Copy the style in `server/_core/env.ts`.
4. **Document every new environment variable** in both `ENVIRONMENT_VARIABLES.md` and `.env.example` (blank value, short comment). A test checks this and will fail you.
5. **Database changes are additive only.** `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`. Never drop or rename a column in the same phase that adds it. Applying the migration twice must not error. Add the file under `drizzle/migrations/`, register it in `meta/_journal.json`, and mirror it in `drizzle/schema.ts`. Copy the shape of `0025_phase1_core.sql`.
6. **Never touch `.env`, any file under `secrets/`, or `.github/workflows/deploy.yml`.** Never restart or rebuild containers. If your work needs one, write the exact command in the pull request under "Owner actions" and let the owner run it.
7. **Never log or return** an API key, a token, a user's file contents, or a provider's raw error body. Error messages shown to users are plain and short.
8. **New behavior ships switched off.** Add a flag to `server/core/flags.ts` with `default: false`, and read it with `flag("MY_FLAG")`. With the flag off, behavior must be exactly what it is today.
9. **The agent must never be able to delete, trash, share, or change permissions on a file.** Not through a tool, not through a tool parameter, ever. If a spec line seems to ask for it, you misread it — stop and ask.
10. **Anything that costs money writes a usage row.** Every model call, search, page fetch, sandbox run or image generation calls `logUsage` from `server/core/usage.ts`. This is how the project knows what it spends.
11. **Attribution.** Claude sessions end every commit message with the two lines below. Qwen Code and Antigravity CLI runs instead end each commit with the single trailer `Agent: qwen-code` or `Agent: antigravity-cli` (see `AGENT_OPS.md` §4.4) and add no Claude line:
    ```
    Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_01Mqk5k9PeC8BmygaaMdpFFb
    ```
    Put no model name anywhere else — not in code, not in comments, not in pull request titles.

## 8. Things that will trip you up

Real traps in this codebase, found the hard way.

- **`npx vitest run` alone runs only 2 client test files.** `vite.config.ts` roots Vitest at `client/`. Use `npm test`, which uses the root `vitest.config.ts` and runs all 131 files.
- **`npm run test:e2e` hits the live website.** It is not part of `npm test`. Don't put it in a loop.
- **`npm run test:db` needs `TEST_DATABASE_URL`.** Without it, those tests skip and exit 0 — that is correct, not a failure. CI runs them against real Postgres 16.
- **Writing a `*.db.test.ts`?** It must skip cleanly when `TEST_DATABASE_URL` is unset, and read that variable inside the test, not at the top of the file.
- **Tool JSON schemas are hand-written today** in `server/kemma/tools.ts`. If you generate them from zod instead, the generated output must match the old one exactly, or you have silently changed what the model sees.
- **The model's prompt cache breaks if the system prompt changes between turns.** That is why retrieved memories travel on the last user message (`dynamicContext`) rather than in the system prompt. Don't move them.
- **Gemini rejects tool-call history without its `thought_signature`.** `server/kemma/engine.ts` handles this. Don't strip that field when you touch message handling.
- **Search costs are not recorded today.** `web_search` writes no usage row. P1-08 fixes it. Until then, cost numbers only cover model calls.
- **`git stash` is shared between worktrees.** If several agents run at once, never use bare `git stash`. Make a temporary commit instead.

## 9. Owner actions still outstanding

Not for you — for the human. List them in your pull request if they block your acceptance criteria.

1. **Benchmark baseline.** Needs real API keys, so it can only run on the server:
   ```bash
   # with EVAL_USER_ID set in .env, and that id added to KEMMA_UNLIMITED_USER_IDS
   npm run bench -- --runs 3
   ```
   Paste the output tables into `docs/spec/BASELINE.md`, commit the JSON from `evals/results/`. Until this exists, no speed or cost criterion in Phase 1 can be proved.
2. **Merge pull request #3** into `main` (the plan and this spec).
3. **Phase 2 needs a database with the pgvector extension.** See P2-01 for the two options. This is a container change the owner performs.
4. **Decisions D2 to D10** in `README.md` §6 — which search provider, which embedding model, and so on. The recommended defaults are fine to build against; the owner can switch later since they are configuration.

## 10. Definition of done, per work package

Tick every box before you call it finished:

- [ ] Every acceptance criterion in the spec section has evidence in the pull request body
- [ ] `npm run check` passes
- [ ] `npm test` passes, with no fewer tests than before
- [ ] New behavior has tests, including what happens when things fail: provider down, timeout, cancelled, bad input
- [ ] Changed files match the spec's list, or each extra one is explained
- [ ] New environment variables are in both documentation files
- [ ] Any migration is additive, idempotent, journaled, and mirrored in `schema.ts`
- [ ] New behavior is behind a flag that defaults to off
- [ ] No secret, key or user content can reach a log or a response
- [ ] Commit messages carry the two attribution lines
- [ ] Pull request base is `develop`

## 11. When you are stuck

Do not guess, and do not quietly build something different.

- **The spec contradicts the code** → follow the code's reality, say so in the pull request, and propose the spec fix.
- **The spec asks for something impossible** → stop. Write what you tried and why it can't work. A half-built package is worse than an honest report.
- **You need something from a work package that isn't merged yet** → stop. Don't build their part too. Say which package you need.
- **You think a rule in §7 should bend for your case** → it shouldn't. Ask first.
