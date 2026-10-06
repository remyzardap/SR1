# Running the build with your agents (qwen + agy on the VPS)

Date: 2026-10-06. Companion to [`END_GOAL.md`](END_GOAL.md) (what we're building) and
[`README.md`](README.md) / [`HANDOVER.md`](HANDOVER.md) (rules every coding agent follows).
This file says **who does which work package, how it gets launched on the VPS, and how it gets reviewed.**

---

## 1. The team

| Agent | Runs where | Headless call | Best at here | Role |
|---|---|---|---|---|
| **Antigravity CLI** (`agy`) | VPS, user `agents` | `agy -p "<prompt>" --output-format stream-json --dangerously-skip-permissions --print-timeout <t>` | Gemini-native work (embeddings, vision, Vertex, Gmail/Calendar/Drive APIs), frontend and UI, browser checks | **implementer, Google + frontend lanes** |
| **Qwen Code** (`qwen`) | VPS, user `agents` | `qwen -p "<prompt>" --yolo` (`--yolo` auto-approves its tools) | long, spec-literal backend work across many files; runs on the owner's Qwen monthly plan; Node 20 is enough | **implementer, backend lanes** |
| **Claude** (cloud sessions like this one) | claude.ai/code | n/a | spec writing, adversarial review, phase gates | **reviewer and gatekeeper**: never reviews its own code |
| **Owner** (you) | phone + VPS | n/a | decisions, keys, container restarts, `develop` → `main` | **merges and deploys** |

The rule that holds everything together: **whoever wrote a PR never approves it.** Claude reviews every PR.
For high-risk packages (marked ⚠ in §5), the *other* CLI also does a read-only review first (§4.3).

Check before relying on the CLI flags: they are taken from the current docs and from
[qwen headless](https://qwenlm.github.io/qwen-code-docs/) and
[agy headless](https://antigravity.google/docs/cli/headless/). Run `qwen --help` and `agy --help` on the VPS once,
and fix `ops/agents/dispatch.sh` if anything changed. Google has said publicly that driving the official
`agy` binary through its documented headless mode is fine; never extract its OAuth credentials or call private endpoints.

## 2. The loop, per work package

```
 owner/Claude: pick WP from §6 wave ─▶ dispatch.sh <agent> <WP> ─▶ agent builds in its own worktree
                                                                        │
                       ┌──────────── gate: npm run check + npm test + forbidden-path scan ◀┘
                       │ red → stop, log kept, nothing pushed
                       ▼ green
               push wp/<WP>-<slug>, open PR into develop (body written by the agent)
                       │
         ⚠ only: other CLI does read-only review ─▶ comment on PR
                       │
               Claude reviews against spec + rubric (README §5) ─▶ APPROVE / CHANGES REQUESTED / REJECT
                       │ changes                                   │ approve
                       ▼                                           ▼
           dispatch.sh fix <agent> <WP>  (same branch)      owner merges into develop
```

At a phase gate, Claude writes the gate report on the `develop` → `main` PR (README §7). Then the owner
merges and turns flags on one at a time.

## 3. One-time VPS setup (owner, one command)

Today the session daemon runs as root next to `/root/sr1/.env`. Auto-approve agents must **not** run like that.
`--print` / `--dangerously-skip-permissions` means the agent's shell can read anything its user can read.
`ops/agents/install.sh` sets up a separate `agents` user for them. As root on the VPS:

```bash
git -C /root/sr1 fetch -q origin develop && git -C /root/sr1 show FETCH_HEAD:ops/agents/install.sh | bash
```

(This takes the scripts from `develop`. To test a branch, put its name in both places and add `SCRIPTS_REF=<branch>` before `bash`.)
It asks once for a GitHub token: a fine-grained token for this repo only, with **Contents, Pull requests and
Issues: read and write** and nothing else. Then it:

1. creates the `agents` user, takes it out of the `docker` group (docker = root) and makes sure `/root` is `700`
2. signs that user in to `gh` with the token, and clones the repo to `~agents/sr1` (not `/root/sr1`, which is production)
3. installs `dispatch.sh` and `watch.sh` root-owned in `/opt/sutaeru-agents/`, so an agent can't rewrite its own gate
4. installs `qwen` (npm, `@qwen-code/qwen-code`) and `agy` (Google's install script) into `~agents/.local/bin`, and runs the watcher as the `sutaeru-agents` systemd service

It's safe to re-run. Re-running is also how you update the scripts after they change on `develop`.
Two things it can't do for you, once each:

```bash
sudo -iu agents bash -c 'PATH=$HOME/.local/bin:$PATH qwen'   # /auth, pick your Qwen plan, then /quit
sudo -iu agents bash -c 'PATH=$HOME/.local/bin:$PATH agy'    # open the link it prints, sign in, paste the code
systemctl restart sutaeru-agents
```

On GitHub (Settings → Branches), protect `main` and `develop`: require a PR, require the `check`, `test`
and `db-tests` checks, and block force-push. Then even a confused agent with the token cannot touch either branch.
Follow the watcher with `journalctl -u sutaeru-agents -f`.

Resource note: each worktree runs its own `npm ci` (≈1 GB of disk with `node_modules`; `npm` shares its download
cache, so later installs are fast). The VPS has 16 cores and 31 GiB, shared with production. The default cap is
**4 runs at once**, and each run's Vitest gets `cores / cap` workers (`VITEST_MAX_FORKS`), so four test runs together
don't starve production. If `free -h` shows less than ~3 GiB available while 4 runs are going, lower the cap (§4.5).

## 4. Launching work

### 4.1 Start a work package

```bash
sudo -iu agents ~/dispatch.sh qwen P1-03 streaming "Stream every turn, plus thinking and segment events"
sudo -iu agents ~/dispatch.sh agy  P1-10 untrusted-fencing "Fencing for untrusted content"
```

It runs in the background with `nohup` if you add `&`. Follow progress with `tail -f ~/agent-logs/P1-03.qwen.jsonl`.
The script (`ops/agents/dispatch.sh`):

1. creates `~/wt/<WP>` on branch `wp/<WP>-<slug>` from the latest `origin/develop`
2. `npm ci`, then **refuses to start** if `npm run check` or `npm test` already fail (a broken `develop` is reported, not built on)
3. sends the agent the prompt in §4.4
4. after the agent exits: re-runs `check` + `test`, and fails if any forbidden path changed (`.env*`, `secrets/`, `.github/workflows/deploy.yml`, `ops/session-manager/`)
5. only if all of that is green: pushes the branch and opens the PR into `develop` with the body the agent wrote

### 4.2 Send review feedback back

```bash
sudo -iu agents ~/dispatch.sh fix qwen P1-03
```

This pulls the PR's review comments and threads, hands them to the same agent in the same worktree,
runs the same gate, and pushes to the same branch. The PR updates in place.

### 4.3 Second-opinion review (⚠ packages only)

```bash
sudo -iu agents ~/dispatch.sh review agy P1-11     # agy reviews qwen's PR, read-only
```

The reviewer gets the diff, the WP section and the rubric. It writes its findings to a file that the script
posts as one PR comment. It is told not to edit files. The script throws away any edits it makes anyway.

### 4.4 The prompt every implementer gets

The template from `README.md` §4, plus three lines for these CLIs:

```
You are implementing work package <WP> in the Sutaeru repository. Your working tree is already on
branch wp/<WP>-<slug> from origin/develop and `npm ci` has run.
Read first, fully: docs/spec/HANDOVER.md, docs/spec/README.md, docs/spec/END_GOAL.md §7,
docs/spec/PHASE-<n>.md section <WP>, and every file listed under "Files" in that section.
Implement exactly that section, with the tests it names. Commit in small commits. Every commit
message ends with the trailer line:  Agent: <qwen-code|antigravity-cli>
(this replaces HANDOVER rule 11 for you; do not add a Claude co-author line).
Run npm run check and npm test until both pass.
Do NOT push, do NOT open a PR, do NOT touch .env, secrets/, .github/workflows/deploy.yml or containers.
When done, write the PR body (README.md §5.3 template, every acceptance criterion with evidence)
to <logdir>/<WP>.pr.md. If the spec is wrong or impossible, write that to the same file instead and stop.
```

### 4.5 Commanding the agents through GitHub (how Claude does it)

Claude's cloud sessions can't reach the VPS, but they can open GitHub issues. The watcher
(`ops/agents/watch.sh`, installed in §3 step 6) checks every 60 s for open issues that are labelled
`agent-task` **and opened by `remyzardap` or the Claude GitHub App (`claude[bot]`)**, and runs each one with
`dispatch.sh`. Anyone else's issues are ignored, including a person whose username happens to be `claude`.
The list is `OWNER_LOGIN` in the service (re-run `install.sh` with `OWNER_LOGIN=a,b[bot]` to change it).

Issue body format (other text in the body is ignored, so Claude adds context above it):

```
agent: qwen        (or agy)
mode: build
wp: P1-03
slug: streaming
title: Stream every turn, plus thinking and segment events
```

`mode` is `build`, `fix`, `review` or `task`; `slug` and `title` are only needed for `build` and `task`.

**`task`: any coding job, not only spec work packages.** Put the instructions below a line that is exactly `---`.
The task's id is `T-<issue number>`, so it builds on branch `wp/T-<n>-<slug>` and opens a PR into `develop`
through the same gate. Send review fixes later with `mode: fix` and `wp: T-<n>`.

```
agent: agy
mode: task
slug: sse-client
title: Typed SSE client for the chat page
---
Replace the if-chain in client/src/pages/Chat.tsx (the SSE handling) with one typed parser and
reducer in client/src/lib/sse.ts. Ignore unknown events. Keep today's events working. Add tests.
```
What happens: label `agent-running` → "picked up" comment → the run → a comment with the result
→ `agent-done` and closed, or `agent-failed` and left open. To retry, fix the body, remove `agent-failed`
and add `agent-task` again. You can open these issues yourself from the GitHub app too.
At most 4 runs go at once by default; extra issues wait for the next free slot. The cap lives in the root-owned file
`/opt/sutaeru-agents/max_agents`. The watcher re-reads it every minute, so `echo 6 | sudo tee /opt/sutaeru-agents/max_agents`
takes effect without a restart. Two runs of the same CLI at once are fine: each run has its own worktree and logs.
Restarting the watcher (re-running `install.sh`) doesn't stop runs in progress. If a reboot does, the watcher marks
those issues `agent-failed` with an "interrupted" comment when it starts.

### 4.6 Asking the agents to investigate (`mode: ask`)

Claude can't log in to the VPS. When it needs something checked, diagnosed or measured there, it doesn't ask the
owner to run commands. It opens an `ask` issue, and an agent does the work on the VPS and reports back:

```
agent: qwen
mode: ask
ref: develop          (optional: which branch to check out; default develop)
---
develop passes check and test in CI and in Claude's sandbox, but the baseline check fails here.
Find out why: look at ~/agent-logs/T-9.check.log and T-9.test.log, rerun the failing step, narrow it down.
```

The agent gets a throwaway checkout of `ref` (after `npm ci`), the logs of earlier runs in `~/agent-logs`, and the
machine facts (CPUs, memory, disk, Node). It may run any command as the `agents` user. It may not commit, push,
use sudo, install global packages or print secrets. Its Markdown report (root cause, evidence, suggested fix)
is posted on the issue, with obvious credentials blanked, and the issue is closed. Nothing is pushed.

**The division of labour this gives:** Claude plans, writes specs, opens `task`/`ask` issues, reads reports and
reviews every PR. The agents build, test and investigate. The owner only does what needs a person: logins and
keys, money, `sudo`-level machine changes an agent reports as needed, and merging `develop` → `main`.

## 5. Who builds what

Lanes come from `README.md` §8. Within a lane, packages run in order. Different lanes run in parallel.
⚠ = high risk (safety, auth, money or cross-cutting): second-opinion review required (§4.3), and Claude
reviews with a mutation spot-check on every gate.

### Phase 1 (M1)

| WP | Title | Lane | Builder | Notes |
|---|---|---|---|---|
| P1-02 | Tool runtime | A | (done, PR #7) | Claude reviews first: everything in lane A and D waits on it |
| P1-08 | Search providers | B | (done, PR #5) | Claude review |
| P1-09 | Tiered reader | C | (done, PR #6) | fix red `check` first: `dispatch.sh fix qwen P1-09` |
| P1-03 | Streaming every turn | A | **qwen** | ⚠ core loop; agy second review |
| P1-04 | Parallel tools | A | **qwen** | |
| P1-05 | Cancellation | A | **qwen** | |
| P1-06 | Output length, auto-continue | A | **qwen** | can run beside P1-05 |
| P1-07 | Stable citations | A | **qwen** | |
| P1-13 | Context manager | A | **qwen** | ⚠ prompt-cache trap (HANDOVER §8) |
| P1-10 | Untrusted fencing | D | **agy** | starts after P1-02 merges |
| P1-11 | Approvals | D | **agy** | ⚠ G3 and the approval rule; qwen second review |
| P1-12 | Email, calendar, image, video, monitor tools | D | **agy** | ⚠ write tools; Google APIs |
| F-01…F-04 | SSE client, steps, citations, approval cards | F | **agy** | Claude writes the F specs first |

### Phase 2 (M2)

| WP | Lane | Builder | Notes |
|---|---|---|---|
| P2-01 pgvector + schema | gate | **qwen** | ⚠ owner action: DB image swap |
| P2-02 Embeddings + backfill | A | **agy** | Gemini embeddings |
| P2-03 Hybrid retrieval | A | **qwen** | |
| P2-04 Memory v2 | A | **qwen** | ⚠ writes/forgets user data |
| P2-05 Conversation search | A | **qwen** | |
| P2-06 Document parsing | B | **qwen** | |
| P2-07 File retrieval | B | **qwen** | |
| P2-11 Persistent sandbox | B | **agy** | |
| P2-08 Model registry + picker | C | **qwen** | |
| P2-09 Modes + router | C | **qwen** | |
| P2-10 Native multimodal | C | **agy** | Gemini vision, thought signatures |
| P2-12 One engine | C | **qwen** | ⚠ retires 5 chat paths; agy second review |
| F-05, F-06, F-08 | F | **agy** | |

### Phase 3 (M3)

| WP | Builder | Notes |
|---|---|---|
| P3-01 Durable runs (gate) | **qwen** | ⚠ owns Phase 3 schema |
| P3-02 Background + notifications | **qwen** | |
| P3-03 Plan / to-do | **qwen** | |
| P3-04 Deep Research v2 | **qwen** | ⚠ promise P2 lives here |
| P3-05 Realtime voice | **agy** | |
| P3-06 Meetings and recordings | **agy** | |
| P3-07 Per-user MCP OAuth | **agy** | ⚠ token storage; qwen second review |
| P3-08 Kemma as MCP server | **qwen** | ⚠ exposes data externally |
| P3-09 Custom agents (shared between members only) | **qwen** | |
| P3-10 BYOK | n/a | dropped: private app (END_GOAL E1) |
| P3-11 Media tools v2 | **agy** | |
| P3-12 Channels | n/a | out of scope for 1.0 (END_GOAL §4) |
| F-07, F-09 | **agy** | |

### Phase 4 (M4)

| WP | Builder | Notes |
|---|---|---|
| P4-01 Schema + structured logging (gate) | **qwen** | |
| P4-02 Tracing | **qwen** | |
| P4-03 Cost truth | **qwen** | ⚠ money |
| P4-04 Credits + tiers | n/a | dropped: no quotas or billing (END_GOAL E1) |
| P4-05 Evals in CI | **agy** | |
| P4-06 Feedback loop | **agy** | |
| P4-07 Safety: guard model, PII | **agy** | ⚠ qwen second review |
| P4-08 Reliability | **qwen** | |
| P4-09 Performance (prompt caching; no load test beyond ~20 people) | **qwen** | |
| F-10, F-11, F-12 | **agy** | household view, PWA polish, invite flow |

Why this split: qwen gets lane A of each phase (one long, ordered chain in the engine, where steady spec-following
matters most). agy gets everything that talks to Google, everything visual, and a parallel lane, so the two
rarely touch the same files. `server/kemma/tools.ts` and `kemmaMax.ts` are the shared collision point
(HANDOVER §6): never run two packages that restructure them at the same time.

**Rebalance on evidence, not loyalty.** After each phase, look at first-pass approval rate, review rounds and CI
reds per agent (§7). Move packages toward whichever agent is doing better in that kind of work.

## 6. Wave 1: what to run now

| Order | Who | Action |
|---|---|---|
| 0 | **Owner** | One-time VPS setup in §3, including the watcher service |
| 1 | **Claude** | Review PR #7 (P1-02), PR #5 (P1-08), PR #6 (P1-09) against the rubric; post verdicts |
| 2 | **qwen** | fix P1-09 (red `check` on PR #6), plus any CHANGES REQUESTED from step 1; Claude opens the `agent-task` issues |
| 3 | **Owner** | Merge approved PRs into `develop`; run the benchmark baseline (HANDOVER §9.1); answer D2–D10 |
| 4 | **qwen** | (Claude opens the issue) `dispatch.sh qwen P1-03 streaming "Stream every turn, plus thinking and segment events"` once P1-02 is merged |
| 5 | **agy** | (Claude opens the issue) `dispatch.sh agy P1-10 untrusted-fencing "Fencing for untrusted content"` once P1-02 is merged (parallel with 4) |
| 6 | **Claude** | Write `docs/spec/FRONTEND.md` with full F-01…F-04 specs so agy has its next packages ready |

## 7. Keeping score

Kept per PR in `~/agent-logs/scoreboard.tsv`; the dispatcher appends a row on every run:
`date  WP  agent  mode(build|fix|review)  gate(green|red)  minutes`.
Claude adds the verdict when it reviews. Look at it at each phase gate:

| Signal | Healthy | Act when |
|---|---|---|
| Gate green on first build | ≥ 70% | < 50%: shrink packages or improve the prompt |
| Review rounds to APPROVE | ≤ 2 | ≥ 3 twice in a row for one agent: move that lane |
| REJECTs | rare | any: re-scope the WP before re-dispatching |
| Out-of-scope files in diff | 0 unexplained | repeated: add the paths to the forbidden scan |

## 8. Failure playbook

| What happens | Do |
|---|---|
| Baseline gate fails before the agent starts | `develop` is broken. Don't dispatch. Fix `develop` first (one small PR). |
| Agent exits with gate red | Read the log tail. Re-run once with `fix`. If it is red again, Claude looks before a third try. |
| Agent wrote "spec impossible" in the PR file | Claude amends the spec section in its own PR. Then re-dispatch. |
| Rate limit or credits out (`429`, quota) | The dispatcher stops; nothing is pushed. Switch that WP to the other agent or wait. |
| Two PRs conflict in `tools.ts` / `kemmaMax.ts` | Merge the earlier one. `dispatch.sh fix` the later one with "merge origin/develop and resolve" (merge, never rebase or force-push). |
| An agent touched a forbidden path | The gate blocks the push. Delete the worktree, and tighten the prompt or the agent's deny config. |
