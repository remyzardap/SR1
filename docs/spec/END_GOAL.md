# Sutaeru 1.0: the end goal

Date: 2026-10-06. This is the target every plan in this repo should serve. `PLAN.md` (stages A–G) is
mostly built; `BACKEND_UPGRADE_PLAN.md` and `docs/spec/PHASE-1…4.md` describe the backend route.
This file says **where that route ends**, what "done" means, and which tracks the specs don't cover yet.
How the work gets done: two Claude sessions plan and review (one owns the backend, one the frontend and the agent tooling); the coding agents qwen and agy build on the VPS, commanded through GitHub issues. Their playbook is `AGENT_OPS.md`, added with the agent tooling in `ops/agents/`.

---

## 1. One sentence

**Sutaeru is a private, phone-first AI workspace for you, your family and friends, that answers fast, researches with sources it has checked,
makes finished work (documents, images, video, code), remembers you, and acts in your Google
account only with your OK. It runs on one VPS you own, and you always know what it costs.**

## 2. Who it is for

| # | Who | What they need | Status |
|---|---|---|---|
| 1 | **The owner** (you), on a phone | One place for research, writing, images, inbox/calendar and code sessions, trusted with real accounts | the main user today |
| 2 | **Family and friends**, invited by the owner | The same app on their own private account, simple enough to use without help | beta invites exist (`server/db/betaInvites.ts`) |

> **Decision E1 (owner, 2026-10-06): Sutaeru stays private, for the owner, family and friends.**
> No public sign-up, no payments, no paying users, not in 1.0 and not planned after it.
> What follows from that:
> - **Access is by invitation only.** Sign-up stays locked (PLAN A3) and members join through beta
>   invites. The owner can switch any account off.
> - **No usage limits and no billing.** Nobody has a quota or spending limit. You pay the providers and
>   can see what each person used. The per-provider caps from PLAN A14 stay in the code as an optional
>   safety switch, unset by default. No credits, tiers or Stripe.
>   Today the code still applies tier quotas (`server/core/quotaCheck.ts`). Until a later package
>   removes them, the owner adds each member's user id to `KEMMA_UNLIMITED_USER_IDS` in `.env`.
> - **Trust is high, but accounts stay separate.** Each person's chats, memories, files and Google
>   connection are private to them; the owner's admin view shows usage and cost, not content.
> - **Small scale.** Up to about 20 people on one VPS. No multi-instance, no load-test targets beyond that.

## 3. What 1.0 does: seven promises

Each promise has a measurable bar. A promise counts as met only when its bar is met on production
with the flags switched on.

| # | Promise | Bar for 1.0 (proposals; adjust once `BASELINE.md` has real numbers) | Comes from |
|---|---|---|---|
| P1 | **Fast.** Text starts streaming almost immediately, even when tools run | first token p50 ≤ 1.5 s on chat; ≥ 40% faster than baseline on research | P1-03, P1-04, P1-13 |
| P2 | **True.** Research answers cite sources, and the citations were checked | citation precision ≥ 0.90; 0 citation-number mismatches in 20 runs | P1-07, P1-08, P1-09, P3-04 |
| P3 | **Makes things.** Finished PDF/DOCX/PPTX/XLSX, images with edits, video jobs, charts from data | each of these works from one chat message and lands in the Library | P1-12, P2-06, P2-11, P3-11 |
| P4 | **Remembers.** It knows your profile, past chats and files, and shows what it used | memory recall ≥ 85%, stale facts ≤ 5%; every injected memory listed in the UI | P2-01…P2-05, P2-07 |
| P5 | **Acts safely.** Gmail, Calendar, Drive actions; nothing leaves without your tap | 0 write actions without an approval row; G1 holds (no delete, share or permission tools exist) | P1-10, P1-11, P1-12, P4-07 |
| P6 | **Keeps working.** Long jobs run in the background, survive restarts and tell you when done | crash mid-run resumes with no duplicate tool calls; push or Telegram notice on completion | P3-01, P3-02, P3-03 |
| P7 | **Honest about money.** Every billable call is logged and you can see what each person used | 100% of runs traced; cost drift vs. invoices ≤ 10% | PLAN A14/A15, P4-01…P4-03, F-10 |

Also in 1.0, but not headline promises: realtime voice (P3-05), model picker and modes including
Council and Private (P2-08, P2-09), Code mode from the phone (exists, `ops/session-manager`).

## 4. Out of scope

Out because Sutaeru is private (E1), or to keep the finish line reachable.

- Public sign-up, payments, Stripe, pricing tiers, credits, per-person quotas (P4-04 is dropped; `server/stripeProducts.ts` stays unused)
- Bring-your-own-key (P3-10 is dropped; the owner's keys serve everyone)
- Marketing landing page work, SEO, app-store native apps (the PWA is the app, installed from the home screen)
- Skill **marketplace** and public custom-agent sharing (P3-09 ships custom agents shared only between members)
- Slack, Discord and email-in channels (P3-12); Telegram and WhatsApp stay as they are
- Multi-region or multi-VPS deployment, and load tests beyond ~20 people (P4-08 covers backups and one-box resilience; P4-09 keeps prompt caching, drops the load test)
- Self-hosted GPU models as the default path (Private mode can use them; nothing depends on them)

## 5. Tracks: what the specs cover, and the gaps

| Track | Covered by | Gap |
|---|---|---|
| **B: backend** (engine, tools, memory, files, runs, quality) | `PHASE-1…4.md`, 46 WPs | none: the spec is complete and agent-ready |
| **F: frontend** (the app people touch) | `DESIGN.md`, `design/sutaeru-app/` prototype, reskin already merged | **no work-package spec.** New backend events (`thinking`, `approval_request`, `plan`, `segment`, file/image cards) have no UI. `client/src/pages/Chat.tsx:529-592` handles only today's events. |
| **O: ops** (VPS, deploy, secrets, agents) | `.github/workflows/deploy.yml`, `ops/session-manager`, `ops/agents/` + `AGENT_OPS.md` | secrets committed in old docs (PLAN §10.1) still need rotating |

### Track F work packages (outline; I write each full spec before it is dispatched)

Each F package depends on the backend package named, ships behind the same flag and targets `develop`.

| ID | What | Needs | Size |
|---|---|---|---|
| F-01 | Typed SSE client: one parser and reducer for every event, unknown events ignored; replaces the if-chain in `Chat.tsx` | P1-03 | M |
| F-02 | Live steps panel: tools, models, skills, sub-agents, collapsed `thinking` | F-01, P1-03 | M |
| F-03 | Source cards and numbered citations with hover quote spans | F-01, P1-07 | S |
| F-04 | Approval cards (approve, edit, decline) for email, calendar, Drive edits; phone-friendly | F-01, P1-11 | M |
| F-05 | Modes and model picker in the chat bottom row (Auto, Fast, Think, Research, Agent, Council, Private) | P2-08, P2-09 | M |
| F-06 | Memory transparency: "used N memories" chip, correct or forget in place | P2-04 | S |
| F-07 | Background runs: run list, re-attach by `runId`, plan/to-do checklist, done notifications | P3-01…P3-03 | L |
| F-08 | Library v2: file cards from sandbox/report outputs, previews, jump to source chat | P2-07, P2-11 | M |
| F-09 | Voice: push-to-talk and duplex screen with barge-in | P3-05 | L |
| F-10 | Owner's household view: usage and cost per person and per month, switch an account off | P4-03 | S |
| F-12 | Invite flow: owner sends an invite link from the phone; first-run screen that explains the app in plain words for non-technical family | none | S |
| F-11 | PWA polish: offline shell, install prompt, safe areas, reduced motion; Lighthouse PWA pass | none | S |

## 6. Milestones to 1.0

Each milestone ends with a gate on `develop` (the phase exit criteria in each `PHASE-n.md`), then the
owner merges `develop` → `main` and turns flags on one at a time in production.

| Milestone | Contains | Done when | Est. calendar with 2 agents + review |
|---|---|---|---|
| **M1 "Fast and true"** | Phase 1 + F-01…F-04 | Phase 1 exit criteria met; promises P1, P2 (partly) and P5 met | ~2–3 weeks |
| **M2 "Remembers and makes"** | Phase 2 + F-05, F-06, F-08 | Phase 2 exit criteria met; P3 and P4 met | ~3 weeks |
| **M3 "Keeps working"** | Phase 3 (minus P3-10, P3-12; P3-09 members-only) + F-07, F-09 | Phase 3 exit criteria met; P6 met | ~4 weeks |
| **M4 "1.0"** | Phase 4 (minus P4-04) + F-10, F-11, F-12 + ops hardening | Phase 4 exit criteria met; P7 met; all seven promises re-checked on production | ~2 weeks |

**1.0 is declared** when all seven promises meet their bars on production for 7 days in a row,
with no G1–G4 violation and no unrotated committed secret.

## 7. What stays true the whole way

These come from `PLAN.md` and `docs/spec/README.md` §3 and are restated here because every agent reads this file:

1. G1: the agent can never delete, trash, share or change permissions on a file. No tool offers it.
2. Writes outside Sutaeru need an approval tap (P1-11). Destructive tools are never offered to a model.
3. New behavior ships behind a flag that is off by default; production turns flags on one at a time.
4. `main` deploys. Agents only ever push `wp/*` branches and open PRs into `develop`.
5. Nobody but the owner touches `.env`, secrets, `deploy.yml`, containers or the production checkout.
6. Every billable call writes a `usage_logs` row.

## 8. Where we are today (2026-10-06, 08:30 UTC)

| Item | State |
|---|---|
| Agent pipeline | live: watcher on the VPS runs qwen and agy from `agent-task` issues; `develop` passes on the VPS since PR #14 (15 s test timeout) |
| `develop` | `bcf2428`; P1-01 merged |
| PR #7 `[P1-02] Tool runtime` | changes requested (MCP confirm tools without approval; Drive allowlist); agy fixing (#10) |
| PR #5 `[P1-08] Search provider layer` | changes requested; port onto P1-02 after #7 merges |
| PR #6 `[P1-09] Tiered page reader` | changes requested (tier-3 recursion, SSRF escalation, abort, cache key, CI heap); agy fixing (#15) |
| PR #2 batch image generation (into `main`) | open since 2026-09-28; stale against the reskin; decide close or rebase |
| Decision E1 | **decided:** private, owner + family and friends (§2) |
| Merging | owner delegated merges: Claude merges approved PRs into `develop`, and `develop` → `main` at phase gates, reporting after |
| Owner to-dos | benchmark baseline (`HANDOVER.md` §9.1), decisions D2–D10 (`README.md` §6), rotate committed secrets, protect `main` and `develop` |
