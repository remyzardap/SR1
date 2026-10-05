# Phase 4: quality engine

**Goal:** every run is traceable, every dollar is accounted for, quality is measured on every change, users' ratings feed back into routing, and the system holds up under load and provider outages. Phase 4 doesn't end: after these WPs, it becomes a weekly routine (§ "Operating rhythm").

**Work packages:** 9. **Estimated total:** about 22 agent-days. P4-01 and P4-02 can start during Phase 3; they don't depend on it.

| ID | Title | Size | Depends on | Lane |
|---|---|---|---|---|
| P4-01 | Phase 4 schema and structured logging | M | Phase 2 | gate |
| P4-02 | Tracing (OpenTelemetry → Langfuse) | M | P4-01 | A |
| P4-03 | Cost truth: every billable unit logged | M | P4-01 | B |
| P4-04 | Credits metering and tier redesign | L | P4-03 | B |
| P4-05 | Evals in CI and nightly | L | P4-02 | A |
| P4-06 | Feedback loop | S | P4-02 | A |
| P4-07 | Safety: guard model, PII redaction, output checks | M | P4-01 | C |
| P4-08 | Reliability: circuit breakers, multi-instance, backups | M | P4-01 | C |
| P4-09 | Performance: provider prompt caching and load test | M | P4-02 | C |

---

## P4-01 Phase 4 schema and structured logging

**Files:** create `drizzle/migrations/0028_phase4.sql` and `server/core/log.ts`; replace `console.*` in `server/` (except scripts and tests) with the logger, one directory per commit to keep the diff reviewable.

**Schema**
```sql
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS unit varchar(16) NOT NULL DEFAULT 'tokens';   -- tokens|request|image|second|minute|page
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS quantity numeric(14,4) NOT NULL DEFAULT 0;
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS feature varchar(32);                           -- chat|research|documents|image|video|voice|memory|search|reader|sandbox|parse
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS billing varchar(16) NOT NULL DEFAULT 'platform'; -- platform|byok
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS run_id varchar(36);
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS trace_id varchar(32);
CREATE INDEX IF NOT EXISTS usage_logs_created_idx ON usage_logs (created_at);
CREATE INDEX IF NOT EXISTS usage_logs_user_created_idx ON usage_logs (user_id, created_at);

CREATE TABLE IF NOT EXISTS message_feedback (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  message_id varchar(36) NOT NULL,
  run_id varchar(36), trace_id varchar(32),
  rating smallint NOT NULL,                  -- -1 | 1
  reason varchar(32),                        -- wrong|outdated|unhelpful|unsafe|too_long|great|other
  comment text,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (user_id, message_id)
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  delta integer NOT NULL,                    -- credits; negative = spend
  reason varchar(32) NOT NULL,               -- grant_monthly|purchase|usage|refund|adjust
  ref varchar(64),                           -- run id / payment id
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_ledger_user_idx ON credit_ledger (user_id, created_at);
```

**Logger:** pino, JSON in production and pretty in dev. `log.child({ reqId, runId, userId })` via `AsyncLocalStorage` set in an Express middleware and in the run service. Redaction paths: `*.authorization`, `*.apiKey`, `*.token`, `*.password`, `*.content`, `*.body`, `*.args.body`. Level from `LOG_LEVEL`.

**Acceptance criteria:** no `console.` left in `server/` outside the allowlist (CI grep check added); a sampled request's lines all share its `reqId`.

---

## P4-02 Tracing (OpenTelemetry → Langfuse)

**Files:** create `server/core/trace.ts` and `ops/langfuse/` (compose snippet + README for D9); instrument `engine.ts` (`callLLM`, tools), the retrieval, reader, search and sandbox services, and the run service.

**Spec**
- OTel SDK with an OTLP HTTP exporter (`OTEL_EXPORTER_OTLP_ENDPOINT`, headers env). Langfuse accepts OTLP; another backend can be swapped in by config. Disabled when the endpoint isn't set (no-op tracer).
- **Spans:** `run` (root; attributes: mode, channel, user id hashed, tier), `llm.call` (model, provider, purpose, tokens in/out/cached, cost, finish reason, fallback index, TTFT), `tool.<name>` (risk, ms, ok/code, result chars), `retrieval`, `reader.tier`, `search.provider`, `approval.wait`.
- **Content capture:** off by default. `TRACE_CONTENT=redacted` stores prompts and outputs truncated to 2k characters, with emails, phone numbers and keys masked (P4-07 redactor); `full` is allowed for admin users only.
- `trace_id` is written to `usage_logs` and `chat_messages.metadata`, so a support lookup goes message → trace.

**Acceptance criteria:** 100% of LLM and tool calls in a bench run appear as spans under one trace per run (span count asserted by an in-memory exporter test); tracing overhead is under 5 ms per span (benchmark).

---

## P4-03 Cost truth: every billable unit logged

**Spec**
- An audit of every money-spending call site (vision, image, video, search, reader tiers, OCR pages, STT and TTS minutes, sandbox seconds, embeddings, rerank, voice). Each writes `usage_logs` with `unit`, `quantity`, `feature`, `billing`, `run_id` and the estimated cost from a price table (`server/config/prices.ts`, overridable through `PRICES_JSON`).
- `kemmaVisionExecute` and `kemmaDocumentScan` read real token usage (no more zeros).
- **Admin endpoints** (`/api/admin/costs`): by day × feature × model, by user (top 50), by tier (revenue vs. cost when Stripe data exists), and cost per run percentiles per mode.
- A weekly **reconciliation script** compares the estimated totals with the provider invoices or exports the owner drops in `ops/costs/` (CSV) and reports the drift per provider.

**Acceptance criteria:** a grep-based CI check finds no provider `fetch` without a nearby `logUsage` (allowlist for exceptions); reconciliation drift ≤ 10% on one month of data (owner supplies the invoices).

---

## P4-04 Credits metering and tier redesign

**Why:** quotas count messages, so a council or deep-research run costs the same "1 message" as "hi", and `trial` and `pro` have identical limits (`QUOTA_LIMITS`).

**Spec**
- **Credits:** 1 credit = `CREDIT_USD` (default $0.001) of estimated platform cost × the `CREDIT_MARKUP` multiplier. BYOK usage costs 0 credits (a small per-request platform fee is optional: `BYOK_FEE_CREDITS`).
- **Spend:** after each run, debit `credit_ledger` (reason `usage`, ref runId).
  - Pre-flight: an estimate per mode (median cost per mode from P4-03) must fit in the balance, or the user gets an upgrade or top-up prompt.
  - A run that hits the balance mid-way finishes its current step and stops gracefully.
- **Tiers** (owner sets the numbers; the defaults are placeholders): monthly grant per tier (`grant_monthly` on the billing cycle), the modes allowed per tier, rate limits per tier. Keep `free`, `trial`, `pro` and `max`, but make trial a time-boxed pro with a smaller grant.
- Stripe top-ups (the existing `stripeProducts.ts`) credit the ledger on the webhook.
- The quota UI shows the credit balance and an estimated cost per mode.
- Behind `FF_CREDITS`. The old message quotas stay until the owner switches.

**Acceptance criteria:** the ledger balance always equals the sum of deltas (property test); concurrent runs can't overdraw beyond one step's estimate (db test with parallel debits); a migration script grants opening balances.

---

## P4-05 Evals in CI and nightly

**Files:** `evals/{harness,judge}.ts`, suites under `evals/<suite>/cases.jsonl`, `.github/workflows/evals.yml`, `evals/README.md`.

**Suites**

| Suite | What it measures | Cases |
|---|---|---|
| `tools` | Right tool, right args (mocked tools; exact or JSON-schema match) | 60 |
| `router` | Mode choice accuracy (P2-09) | 40 |
| `memory` | Recall, stale facts, duplicates (P2-04) | 50 convos |
| `files` | QA over parsed docs (P2-07) | 40 |
| `research` | Citation precision and recall, gold accuracy (P3-04) | 20 |
| `injection` | No tool misuse or data exfiltration from poisoned pages, emails or files | 30 |
| `style` | Answer format rules from the system prompt (no em-dash punctuation, direct answer first, etc.) | 30 |
| `cost_latency` | Median cost and time per mode against budgets | bench |

- **Judge:** an LLM-as-judge with a rubric per suite (Claude Sonnet 5.5 through the gateway; temperature 0; the judge prompt is versioned). Calibrate on 30 human-labeled samples and report agreement.
- **CI:** on PRs labeled `run-evals`, run a 25-case smoke across suites with cheap models (budget guard: abort above $2). Nightly on `develop`: full suites. Results go to `evals/results/<suite>-<date>.json`, plus a markdown trend table committed by the workflow bot to an `eval-results` branch.
- **Gate:** a nightly drop of more than 3 points on any suite opens a GitHub issue automatically with the diff of failing cases.

**Acceptance criteria:** the nightly runs green for 3 consecutive nights; the smoke job finishes in under 10 minutes and under $2.

---

## P4-06 Feedback loop

**Spec**
- `POST /api/feedback { messageId, rating, reason?, comment? }` (one per user per message; editable) writes `message_feedback` with the message's `run_id`/`trace_id` and adds a Langfuse score.
- Weekly job: negative-feedback traces (with content only when `TRACE_CONTENT` allows it) are clustered by reason and intent, and the top 20 are written as candidate eval cases to `evals/candidates/<date>.jsonl` for human review. Nothing enters a suite automatically.
- Router report: win-rate per intent × model (thumbs up minus down per 100), suggesting changes to the `modes.ts` mapping as a PR for the owner to approve. No automatic routing changes.

**Acceptance criteria:** the feedback round-trip is tested; the weekly job produces a candidates file from a seeded DB.

---

## P4-07 Safety: guard model, PII redaction, output checks

**Spec**
- **Injection guard** on untrusted content (P1-10 fencing): `GUARD_PROVIDER` = `heuristic` (default; P1-10) | `llm` (cheap model classifier with a JSON verdict) | `promptguard` (self-hosted Llama Prompt Guard 2 at `GUARD_URL`).
  - Content over a threshold is replaced by `[content removed: suspected prompt injection]` in the fenced block, and a notice is emitted.
  - Runs on web, email, drive, MCP and file content, and only on the parts that go to the model (after reader selection), to bound cost.
- **PII redaction** (`server/core/redact.ts`): regex plus optional Presidio (`PRESIDIO_URL`) for emails, phone numbers, cards, IBANs, national IDs and keys. Used for trace content (P4-02), for logs, and in **Private mode** before any third-party call (a reversible mapping: placeholders are restored in the answer).
- **Output checks:** never echo strings that match secret patterns (API keys, tokens) in answers or tool args sent to external tools (block plus notice). Image prompts already pass `isBlockedPrompt`; extend the same check to video and edit_image.
- **Exfiltration rule:** a write tool whose arguments contain content that came from untrusted input **and** an external destination (email to a new address, MCP write) always requires approval, even if the tool normally doesn't. Track provenance by marking strings from fenced content (hash set) and checking the args.

**Acceptance criteria:** the `injection` eval suite pass rate is ≥ 95% with `GUARD_PROVIDER=llm`; redaction unit tests over 50 PII samples, with ≤ 2% misses on the listed types; the exfiltration rule test passes.

---

## P4-08 Reliability: circuit breakers, multi-instance, backups

**Spec**
- **Circuit breaker per model** (`server/core/health.ts`): open after 5 failures within 2 minutes (5xx, timeout, network); half-open after 60 s with 1 probe. `callChainFor` skips open circuits. Exposed in `/api/admin/health` and as trace attributes.
- **Multi-instance readiness:** move the remaining process-local state to Postgres or LISTEN/NOTIFY: search and page caches (already L2), approvals waiters (P3-01 durable), the run bus (P3-01), and the rate limiter (`express-rate-limit` with a Postgres or memory store, documented). List what's still process-local in `ops/SCALING.md`.
- **Backups:** a nightly `pg_dump` job script in `ops/backup/` (compressed, 14-day rotation, an optional S3 upload with the existing AWS vars) and a tested restore runbook (the owner runs a restore drill once; record the date in the runbook).
- **Chaos tests:** a fake provider that returns 500s, timeouts or garbage streams for a configured share of calls; the bench must complete with a ≥ 95% success rate when one provider is fully down.

**Acceptance criteria:** with the primary chat model forced fully down, the chat bench success rate is ≥ 95% and p50 latency increases by ≤ 30%; the backup and restore drill is documented.

---

## P4-09 Performance: provider prompt caching and load test

**Spec**
- **Prompt caching** beyond Qwen:
  - Claude through LiteLLM with `cache_control` on the system prompt and tools block (verify the gateway passes it through).
  - Gemini implicit caching (keep the prefix stable; already structured that way) and explicit context caching for long attached documents reused across turns (cache id stored in `session_files` metadata).
  - Record the cached tokens per provider (already a column).
- **Load test:** `ops/load/` with autocannon or k6 scripts: 50 concurrent chat streams with a fake fast provider (to measure server overhead), plus 5 concurrent real runs. Targets: server overhead p95 < 50 ms per event, memory stable over 30 minutes (no leak > 50 MB), no event-loop lag over 100 ms.
- Fix what the load test finds (in this WP, scoped to findings).

**Acceptance criteria:** cached-input share ≥ 40% on multi-turn bench chats for providers that support caching; load targets met (report attached).

---

## Phase 4 exit criteria

| Metric | Target |
|---|---|
| Runs with a full trace | 100% |
| Cost reconciliation drift | ≤ 10% per provider |
| Nightly evals | green 3 nights running; auto-issue on regressions |
| Injection suite | ≥ 95% |
| Chat success with one provider down | ≥ 95% |
| Credits ledger integrity | property and concurrency tests pass |

## Operating rhythm (after Phase 4)

- **Daily:** an automated cost and error digest (top regressions, open circuits) to the owner's Telegram.
- **Weekly:** review the feedback candidates → promote to eval suites; review the router win-rates → adjust `modes.ts`; check the model registry for new releases and prices (add to the registry behind `enabled: false`, run the evals, then enable).
- **Monthly:** cost reconciliation against invoices; backup restore spot check; prune retired code paths.
