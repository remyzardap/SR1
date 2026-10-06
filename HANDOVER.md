# Handover: Sutaeru 1.0 work (backend, frontend, agent tooling)

From the backend Claude session, 2026-10-06 ~17:45 UTC. The owner asked that all work move to the next agent.

## Rules
- **Who does what:** Claude plans, writes specs and reviews. The VPS agents (agy, qwen, opencode) build, test and investigate through `agent-task` issues.
- **Issue format:** `agent:` `mode:` (build, fix, task, ask, review, push) `wp:` (it must look like P1-03, F-01 or T-<issue>) `slug:` `title:`.
- **Writer ≠ reviewer.**
- **Merging:** merge reviewed PRs into **develop** yourself once CI is green. Squash, with the title `[P1-xx] Title (#n)`. If a branch is behind, update it and wait for green first. Ask the owner before anything goes to **main**, because main deploys.
- **How the owner wants answers:** short and plain, one command per block (their terminal mangles multi-line pastes).

## Phase 1 (docs/spec/PHASE-1.md): 9 of 13 merged
Merged: P1-01, P1-02, P1-03, P1-04, P1-05 (#52), P1-06 (#60), P1-07 (#59), P1-08, P1-10 (#37).

| WP | State | Next step |
|---|---|---|
| P1-11 approvals | PR #65. My review asks for 5 must-fixes; fix job #70 (agy) is queued | Re-review the fix, then merge. Then write F-04 and queue P1-12 |
| P1-13 context manager | #55 (agy) is running. It also carries the P1-05 follow-ups (abort decided only on `signal.aborted`; no duplicated text when a backup model runs) | If it fails, split it into 13a (result handles) and 13b (compaction/engine) |
| P1-09 page reader | PR #6 is approved but needs develop merged in. Fix job #47 is blocked by a leftover merge in ~/wt/P1-09 | Re-queue #47 after the owner clears it (command below) |
| P1-12 new tools | not started | Queue it after P1-11 |
| T-62 | qwen is adding a 12-character minimum overlap to P1-06's continuation joining | Review it |

The 5 must-fixes on #65:
1. No fallback gate with a no-op emitter. Offer approval tools only when the flag is on and `ctx.approvals` exists.
2. MCP confirm tools go through the structured state machine.
3. Return 400 when edited args change `targetRef`.
4. ApprovalCard's fetch uses the `VITE_SR1_API_ORIGIN` prefix.
5. Merge develop.

## Frontend (docs/spec/FRONTEND.md)
- **F-01 and F-02:** merged, and released to main (#56).
- **F-03 citation chips:** #69 (agy) is queued. Review points: the rehype plugin is added on top of `defaultRehypePlugins`; chips appear only in answer text; cards are numbered by `id`; downloads keep working; unknown ids render as plain text.
- **F-04:** P1-11 already ships a basic ApprovalCard. F-04 becomes polish: phone layout, a form editor instead of raw JSON, an expiry countdown, and state restored on reload. Spec it after #65 merges.
- **Data shapes from P1-07:**
  - `metadata.sources` (`{id,url,title,snippet?}`, ids stable)
  - `metadata.activity` (`{tool,label,status,ms}`)
  - `metadata.usage`, `metadata.model`, `metadata.thinking?`, `metadata.cancelled?`
  - History comes from `chat.getMessages`.

## Agents
- **agy:** works.
- **qwen:** dropped connections on long runs. Settings fix #67 and the dispatcher retry #66 are merged, but #66 isn't on the VPS until install.sh runs.
- **opencode:** the smoke test (#57) failed on file permissions. The fix (#63) is merged, but not on the VPS until install.sh runs. Re-queue #57 afterwards.
- **kimi:** the old CLI is a dead stub. The VPS Claude session is installing the new Kimi Code CLI.

## Owner to-dos (one per block)
```
git -C /root/sr1 fetch -q origin develop && git -C /root/sr1 show FETCH_HEAD:ops/agents/install.sh | bash
```
```
sudo -iu agents bash -c 'cd ~/wt/P1-09 && git merge --abort'
```
- Deploy main `b433232` on the VPS (the live site is still on 9ac3b91).
- Fix the GitHub deploy secrets: VPS_HOST, VPS_USER, VPS_SSH_KEY.
- Sign opencode in as the `agents` user.
- Optional: branch protection on main and develop; raise `/opt/sutaeru-agents/max_agents` to 6 if the VPS has the RAM.

## The end goal
docs/spec/END_GOAL.md on develop has the seven promises, milestones M1–M4, and what's out of scope.
