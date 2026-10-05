# Phase 3: what sets it apart

**Goal:** long tasks run in the background and survive restarts; research is deeper and verifiable; voice is real-time; users connect their own tools, build their own agents and bring their own keys; Kemma is reachable from Slack, Discord, email and other AI apps.

**Work packages:** 12. **Estimated total:** about 45 agent-days; about 3–4 calendar weeks with 3–4 lanes in parallel.

| ID | Title | Size | Depends on | Lane |
|---|---|---|---|---|
| P3-01 | Durable runs: schema, run service, resumable stream | L | Phase 2 | gate |
| P3-02 | Background agent mode and notifications | M | P3-01 | A |
| P3-03 | Visible plan / to-do tool | S | P3-01 | A |
| P3-04 | Deep Research v2 | L | P3-01 | A |
| P3-05 | Realtime voice | L | P3-01 | B |
| P3-06 | Meetings and recordings | M | P3-05 (STT providers) | B |
| P3-07 | Per-user connectors (MCP OAuth) | L | P3-01 | C |
| P3-08 | Kemma as an MCP server | M | P3-07 (token store patterns) | C |
| P3-09 | Custom agents and skills marketplace | L | P3-01 | D |
| P3-10 | Bring your own key (BYOK) | M | P3-01 | D |
| P3-11 | Media tools v2 | M | Phase 2 | D |
| P3-12 | Channels: Slack, Discord, email-in | M | P2-12 | C |

---

## P3-01 Durable runs: schema, run service, resumable stream

**Why:** a run lives inside one HTTP request today. A refresh, a dropped connection or a deploy loses it, and approvals can't survive a restart.

**Files:** create `drizzle/migrations/0027_phase3.sql`, `server/runs/{service,store,bus,checkpoint}.ts`, `server/routes/runs.ts` (mounted at `/api/runs`) and tests; edit `server/routes/kemmaStream.ts` (becomes a thin client of the run service), `server/kemma/approvals.ts` (durable), `server/kemma/engine.ts` (checkpoint hooks).

**Schema (`0027_phase3.sql`; owns all of Phase 3's schema)**
```sql
CREATE TABLE IF NOT EXISTS agent_runs (
  id varchar(36) PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  session_id varchar(36),
  agent_id varchar(255),
  channel varchar(16) NOT NULL DEFAULT 'web',
  mode varchar(16) NOT NULL,
  status varchar(20) NOT NULL,               -- queued|running|waiting_approval|done|error|cancelled
  input jsonb NOT NULL,
  checkpoint jsonb,                          -- engine state at the last completed step
  plan jsonb,                                -- P3-03
  output text,
  error text,
  usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  last_seq integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  started_at timestamp, finished_at timestamp,
  heartbeat_at timestamp
);
CREATE INDEX IF NOT EXISTS agent_runs_user_idx ON agent_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_status_idx ON agent_runs (status) WHERE status IN ('queued','running','waiting_approval');

CREATE TABLE IF NOT EXISTS run_events (
  run_id varchar(36) NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  type varchar(32) NOT NULL,
  data jsonb NOT NULL,
  at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, seq)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  endpoint text NOT NULL UNIQUE,
  keys jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_connections (
  id varchar(36) PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  server varchar(64) NOT NULL,               -- catalog id from mcp.config.json
  server_url text NOT NULL,
  client_info_enc text,                      -- dynamic client registration result (encrypted)
  tokens_enc text,                           -- access/refresh/expiry (encrypted)
  code_verifier_enc text,
  status varchar(16) NOT NULL DEFAULT 'pending', -- pending|active|error|revoked
  scopes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (user_id, server)
);

CREATE TABLE IF NOT EXISTS user_api_keys (
  id varchar(36) PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  provider varchar(32) NOT NULL,             -- anthropic|openai|google|qwen|openrouter|...
  key_enc text NOT NULL,
  last4 varchar(4) NOT NULL,
  validated_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS oauth_clients (      -- for Kemma-as-MCP-server (P3-08)
  client_id varchar(64) PRIMARY KEY,
  client_secret_hash text,
  redirect_uris jsonb NOT NULL,
  name text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS oauth_tokens (
  token_hash char(64) PRIMARY KEY,
  client_id varchar(64) NOT NULL,
  user_id integer NOT NULL REFERENCES users(id),
  scopes text NOT NULL,
  kind varchar(16) NOT NULL,                 -- access|refresh|code
  expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE agents ADD COLUMN IF NOT EXISTS owner_user_id integer;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS visibility varchar(16) NOT NULL DEFAULT 'system'; -- system|private|link|public
ALTER TABLE agents ADD COLUMN IF NOT EXISTS share_token varchar(32);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;        -- model, mode, tools, skills, starters
ALTER TABLE agents ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
```
- **Encryption helper** `server/core/secretBox.ts`: AES-256-GCM with `DATA_ENCRYPTION_KEY` (32 bytes, base64). Store `v1:<iv>:<tag>:<ct>`, and support key rotation through the version prefix. Reuse it for Google tokens later (not in this WP).

**Run service spec**
- `startRun({ userId, sessionId, mode, input, channel, agentId?, background })`:
  - Creates the row.
  - Foreground (chat): executes in-process immediately.
  - Background: `enqueueJob("agent-run", { runId })`.
- **Events:** every `EngineEvent` → `bus.publish(runId, event)` → appended to `run_events` (batched: flushed every 250 ms or every 20 events; `seq` monotonic per run) and delivered to live subscribers. Token events are coalesced per flush (concatenated) to keep the row count low.
- **Bus:** in-process `EventEmitter` plus Postgres `LISTEN/NOTIFY run_<id>`, so a second instance can tail a run. The NOTIFY payload carries only `{seq}`; subscribers read rows.
- `GET /api/runs/:id/events`: SSE that replays from `Last-Event-ID` or `?after=` and then tails live; ends after the `done`, `error` or `cancelled` event. Same-user check.
- `POST /api/runs/:id/cancel`, `GET /api/runs?status=&limit=`, `GET /api/runs/:id`.
- **Checkpoint:** after each completed engine step, store `{ messages (post-compaction), step, toolCount, sources, usage }` in `agent_runs.checkpoint`. On worker start, runs left in `running` with `heartbeat_at` older than 2 minutes are resumed from the checkpoint (at most 2 resume attempts; then `error`). Heartbeat every 20 s.
- **Approvals become durable:** while waiting, the status is `waiting_approval` and the worker **releases** the job (it doesn't hold a process). The approval decision endpoint re-enqueues `agent-run` with `{ runId, resume: true }`.
  - On resume, the engine reads the approval row (P1-11 state machine): `executed` reuses the stored `result`; `approved` executes through the compare-and-set; anything else returns its decision to the model.
  - A crash between `executing` and `executed` marks the approval `failed` with "outcome unknown". The model must verify (for example re-read the resource) before asking again. It never re-sends blindly.
- `/api/kemma/stream` keeps its request contract: it creates a foreground run and streams its events (the `meta` event now carries the `runId`), so the client can reconnect through `/api/runs/:id/events`.
- Per-tier concurrency limits on active runs (free 1, pro 3, max 6).

**Tests:** replay after a disconnect yields an identical event sequence; resume from checkpoint after a simulated crash produces no duplicate tool executions (tools that ran are recorded in the checkpoint); approval wait releases the worker and the decision resumes it; cancel; user isolation; NOTIFY across two bus instances (db test).

**Acceptance criteria:** AC1: kill the process during step 3 of a 6-step agent run, restart, and the run completes with steps 1–3 not re-executed. AC2: a client disconnect followed by a reconnect gets all events in order.

---

## P3-02 Background agent mode and notifications

**Files:** `server/runs/worker.ts`, `server/services/notify/{index,webpush,email,telegram}.ts`, `server/routes/push.ts`; client: a runs list ("Tasks") and a reconnect banner.

**Spec**
- `agent` and `research` modes run with `background: true`. The chat shows a run card that streams while open; closing the tab doesn't stop the run.
- When a run finishes, notify through the user's enabled channels:
  - Web push (`web-push`, VAPID keys `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`; subscriptions in `push_subscriptions`)
  - Email (the existing nodemailer setup: a short summary and a link)
  - Telegram, if the account is linked

  Per-user preferences live in `user_settings`.
- **Scheduled tasks:** `schedule_task {prompt, cron | at, mode}` (write, no approval; max 20 per user). It reuses the pg-boss schedule API and starts background runs. Monitors (existing) become a preset of scheduled research.
- Admin: `GET /api/admin/runs` with status counts and the slowest and most expensive runs.

**Acceptance criteria:** a run started on mobile completes while the app is closed, and the push notification arrives (shown in the PR); scheduled tasks fire at the right time (test with a fake clock).

---

## P3-03 Visible plan / to-do tool

**Spec**
- Tool `update_plan { items: [{ id, title, status: "pending"|"in_progress"|"done"|"skipped" }], note? }` (read risk; no side effects).
- The engine stores the plan in the run and emits a `plan` event with the full list.
- System prompt rule for `agent` and `research` modes: for tasks needing more than 3 tool steps, write a plan first, keep exactly one item `in_progress`, and update it as you go.
- Client: a checklist component pinned at the top of the run card.

**Acceptance criteria:** on 5 bench agent tasks, a plan appears within the first 2 steps and ends with all items done or skipped.

---

## P3-04 Deep Research v2

**Files:** create `server/kemma/research/{orchestrator,plan,gather,evidence,gaps,write,verify,export,academic}.ts`; edit `server/routes/fn/research.ts` (same SSE contract, now backed by a run); extend `evals/research`.

**Spec (pipeline; each stage emits `research_stage` events)**
1. **Clarify** (optional, `research.clarify=true`): if the classifier rates the question ambiguous, ask up to 3 multiple-choice questions through an `ask_user` event and wait (durable, like approvals). Skipped in automatic or scheduled runs.
2. **Plan:** the reasoning model returns a JSON schema `{ outline: [{ section, questions[] }], sub_questions[] }`.
3. **Gather (rounds):** run sub-agents in parallel (`RESEARCH_PARALLEL`, default 4; each with its own budget and the search, browse and academic tools; models from the `fast` mode).
   - Each sub-agent returns `findings: [{ claim, quote, url, title, published_at }]`, where `quote` must be a verbatim span of the page it read (checked: discard findings whose quote isn't found in the fetched page text after whitespace normalization).
   - Pages read are chunked into `knowledge_chunks` (scope `run`).
4. **Gap analysis:** an LLM compares the findings with the outline and returns `{ coverage: 0..1, missing_questions[] }`. Another round runs if `coverage < 0.8` and rounds remain.
5. **Depth presets:** quick (1 round, ≤ 10 sources), standard (2 rounds, ≤ 25), deep (4 rounds, ≤ 60). The user picks; the default is standard.
6. **Write:** section by section. Each section gets the top-k evidence chunks and findings from `hybridSearch` (scope `run`) and is streamed. Every claim is cited `[n]` with **stable run ids** (P1-07).
7. **Verify:** each cited sentence is checked against its quote or chunk by the cheap model (`supported | partial | unsupported`) in batches of 20.
   - Unsupported sentences are rewritten with hedging or removed (rewrite pass).
   - Sources carry `verified`, and the final event includes `verification: { checked, supported, rewritten, removed }`.
8. **Assemble:** title, executive summary (5 bullets), sections, limitations, sources with quotes (hover data in source metadata).
9. **Export:** `generate_file` PDF/DOCX; `pptx` (pptxgenjs: a summary slide plus one slide per section); `xlsx` of the extracted data points when a section has tabular findings.
10. **Academic providers** (tools available in research): OpenAlex (no key; `OPENALEX_MAILTO`), arXiv API, Semantic Scholar (optional `S2_API_KEY`), PubMed E-utilities. Results map to `SearchHit` with DOI links.

**Eval extension:** citation precision (sampled cited sentences judged supported by an LLM judge on Sonnet 5.5), citation recall (answer facts that are cited), factual accuracy on 20 gold questions, cost and latency per preset. Results go to `evals/results/research-<date>.json`.

**Acceptance criteria:** AC1: citation precision ≥ 0.90 on standard. AC2: gold accuracy ≥ the Phase 2 research score + 10 points. AC3: standard preset median cost ≤ $0.60 and time ≤ 6 min (numbers reported; thresholds can be adjusted by the owner).

---

## P3-05 Realtime voice

**Why:** voice today is request/response STT and TTS, plus a separate ElevenLabs conversational agent with its own brain (`routers/intelligence.ts` `/kemma/call`).

**Files:** create `server/voice/{session,ws,vad,stt/{deepgram,elevenlabs,whisper},tts/{elevenlabs,cartesia,kokoro},chunker}.ts`; WebSocket at `/ws/voice` (alongside the existing `/ws/intelligence`); client: `useVoiceSession` hook and the call screen.

**Spec (decision D8 default: Node pipeline)**
- **Client → server:** binary frames of 16 kHz mono PCM16 (20 ms) plus JSON control `{type: "start" | "stop" | "interrupt" | "config"}`. Client-side VAD (e.g. `@ricky0123/vad-web`) sends `interrupt` when the user starts speaking while TTS plays (barge-in).
- **STT** (`VOICE_STT`):
  - `deepgram` (default; streaming WS, interim results, endpointing at 300–500 ms)
  - `elevenlabs` (Scribe; batch per utterance)
  - `whisper` (self-hosted faster-whisper HTTP at `WHISPER_URL`; batch per utterance, segmented by server-side Silero-compatible VAD or client VAD)
- **Turn:** on the final transcript, `runTurn` (P2-12) with channel `voice`, mode `fast`, the voice prompt (`buildKemmaVoicePrompt`), and tools limited to read tools plus approvals spoken aloud ("Should I send it?" → yes or no answered by voice).
- **TTS** (`VOICE_TTS`): `elevenlabs` (streaming WS input, keeping the current voice settings env), `cartesia`, `kokoro` (self-hosted Kokoro-FastAPI at `KOKORO_URL`).
  - `chunker.ts` splits streaming text at sentence boundaries (minimum 40 characters; flush on punctuation or after 1.2 s), so audio starts after the first sentence.
- **Barge-in:** an `interrupt` aborts the engine signal (P1-05) and the TTS stream, sends `{type:"cleared"}`, and records the partial answer as "interrupted".
- **Metrics** in events and logs: `stt_final_ms`, `llm_first_token_ms`, `tts_first_audio_ms`, `e2e_ms` (end of user speech to first audio byte).
- **Quota:** `voice_minute`, counted per started minute of session audio.
- The ElevenLabs agent path stays behind `VOICE_LEGACY=1` until the gate, then is retired.

**Acceptance criteria:** AC1: e2e p50 ≤ 1.2 s and p90 ≤ 2.0 s across 30 turns on the VPS with Deepgram + ElevenLabs (log excerpt). AC2: barge-in stops audio within 300 ms. AC3: the same memories and tools as text chat (trace).

---

## P3-06 Meetings and recordings

**Spec**
- Upload or record (web) → STT with diarization (`deepgram` diarize / `assemblyai` / self-hosted `pyannote` + whisper at `DIARIZE_URL`).
- Output: a transcript with speaker labels → summary, decisions, action items (owner and due date when stated), open questions → saved as a document (`files`, kind `document`) and indexed into `knowledge_chunks` (scope `file`).
- Memory extraction runs on the summary (P2-04).
- Tool `meeting_search` is covered by `file_search` (no new tool).
- Long audio (≤ 3 h) runs as a background run (P3-01) with progress events.

**Acceptance criteria:** a 30-minute two-speaker fixture yields correct speaker turns for ≥ 90% of the words (provider dependent; report the measured number), and action items match the fixture key.

---

## P3-07 Per-user connectors (MCP OAuth)

**Why:** MCP today uses one static bearer token per server from env (`server/kemma/mcp/client.ts`), so it's shared by everyone and in practice all disabled.

**Files:** create `server/kemma/mcp/{userRegistry,oauthProvider,catalog}.ts` and `server/routes/connectors.ts`; edit `mcp.config.json` (real URLs, `auth: "oauth" | "bearer-env" | "none"`); client: a Connectors page (extend `Connections.tsx`).

**Spec**
- **Catalog** (from `mcp.config.json`): id, name, URL, auth type, default tool modes (read / draft / confirm), icon. Fill in real URLs for the vendors that publish remote MCP servers (Notion, Linear, Atlassian, Asana, GitHub, Figma, Canva, Stripe, HubSpot, Zapier per-user URL, and others). **Verify each URL and its OAuth support**; anything unverified stays `enabled: false`.
- **OAuth:** implement the SDK's `OAuthClientProvider` against `user_connections` (encrypted with `secretBox`): `clientInformation/saveClientInformation` (dynamic client registration), `tokens/saveTokens`, `codeVerifier/saveCodeVerifier`, `redirectUrl` = `${APP_URL}/api/connectors/callback`, and `redirectToAuthorization` captures the URL to return to the client.
  - `POST /api/connectors/:id/connect` → `{ authorizeUrl }`
  - `GET /api/connectors/callback?code&state` → `transport.finishAuth(code)` → status `active` → redirect to the Connectors page
  - `DELETE /api/connectors/:id` → revoke where supported, then delete tokens
- **Per-user registry:** a connection pool keyed by `(userId, server)` with LRU (max 200 open clients) and an idle close after 10 min. `toolsFor(ctx)` (P1-02) merges the user's active connectors' tools. Tool names stay `mcp__<server>__<tool>`.
- **Modes:** read → offered; draft → offered (write, no approval); confirm → approval (P1-11); any tool whose name matches `FORBIDDEN_MCP_WORDS` (delete, share, permission and similar; existing list) → never offered (G1).
- The global env-token servers keep working as `auth: "bearer-env"` (admin only).

**Tests:** OAuth provider persistence round-trip (encrypted at rest); token refresh path; user A never sees user B's tools (registry test); forbidden names filtered; the pool evicts idle clients.

**Acceptance criteria:** three real connectors (for example Notion, Linear, GitHub) connected end to end, with a read query answered in chat (screenshots); revoke works.

---

## P3-08 Kemma as an MCP server

**Spec**
- `/mcp` endpoint (StreamableHTTP server transport from `@modelcontextprotocol/sdk`) with OAuth 2.1:
  - Authorization-server metadata
  - Dynamic client registration (`oauth_clients`)
  - Authorization code + PKCE through the normal Sutaeru login and consent page
  - Hashed tokens (`oauth_tokens`) with scopes `kemma.chat`, `kemma.memory.read`, `kemma.memory.write`, `kemma.files.read`, `kemma.research`
- **Tools:**
  - `kemma_ask {prompt, mode?}` runs `runTurn` and returns the final text plus sources
  - `memory_search`, `memory_save`
  - `files_search`
  - `research_start {question, depth}` → runId; `research_status {runId}` → status or final report
  - `document_generate {brief, kind, format}` → file URL
- Quota counted like normal use. Per-client rate limit. Every call is audit-logged with the client id.

**Acceptance criteria:** works from Claude Desktop and one other MCP client (screenshots); revoking the client token stops access immediately.

---

## P3-09 Custom agents and skills marketplace

**Spec**
- **Custom agents** (extend the `agents` table, P3-01 schema): owner, name, description, avatar, `config = { systemPrompt, model?, mode, tools[], skills[], knowledgeFiles[], starters[] }`, visibility private | link | public, version (bumped on edit).
  - Knowledge files are indexed with scope `agent`.
  - tRPC CRUD procedures, plus `agents.fromShareToken`.
- **Engine:** `agentId` on a run applies the agent config.
  - Tools are the **intersection** of the agent's list and what the runner may use (tier, connections). An agent can never widen access.
  - The agent prompt is appended after Kemma's base prompt (the base safety rules stay first).
- **Sharing:** a link opens a chat with that agent. The runner pays usage. Public agents go through admin review (reuse the `skill_reviews` flow) before listing.
- **Skills:**
  - Users author `SKILL.md`-style skills in the UI. Private skills are auto-approved for their owner (content-hash pinned); public skills need review.
  - Ratings use `skill_ratings`.
  - **Auto-suggest:** embed skill descriptions; when a message matches above a threshold, add a system hint "Relevant skill: <name> (load_skill)".
- **Ship 10 first-party skills** in `skills/`: SWOT analysis, pitch deck outline, contract review checklist, SEO audit, financial model (sandbox), meeting minutes, email triage, trip planner, PRD writer, competitor teardown. Each has instructions, an output format and, where needed, a script.

**Acceptance criteria:** create, share by link, and use an agent from another account (tool intersection verified by a test); auto-suggest picks the right skill for 8 of 10 labeled prompts.

---

## P3-10 Bring your own key (BYOK)

**Spec**
- Settings page: add a key per provider. Save validates it with a cheap call (list models, or a 1-token completion), stores it encrypted (`secretBox`), and shows only the last 4 characters.
- **Routing:** when the chosen model's provider has a user key, call that provider directly with the user's key (`resolveRouteAuth` gains a `userId` parameter; key lookup is cached for 60 s).
  - Usage rows get `billing='byok'` (column added in P4-03; until then `purpose` is suffixed with `:byok`).
  - BYOK calls skip the platform spend cap and token quota, but keep the rate limits.
- **Safety:** keys never leave the server, never appear in logs or errors (redaction in `fetchWithRetry` error paths), and are deleted on account deletion. Audit log on add and remove.
- With a key, users can pick models outside their tier (D5).

**Acceptance criteria:** BYOK calls are excluded from platform spend in `usage_logs` aggregation (test); an invalid key is rejected on save; redaction is tested by forcing a provider error whose body echoes the key.

---

## P3-11 Media tools v2

**Spec**
- `edit_image {image (fileId or the last image in the session), instruction, mask?}`: engines Gemini Flash Image edit, gpt-image edit (gateway), and FLUX Kontext / Qwen-Image-Edit on the Forge GPU or through **fal.ai** (`FAL_KEY`).
  - "Make it darker" with no image argument uses the session's last generated or attached image.
- New `fal` engine adapter (one key, many models) for image (FLUX dev/pro, Ideogram, Recraft) and video (Kling, Wan, LTX). The model list is in the registry style (`server/config/mediaModels.ts`) with prices.
- Utility tools: `remove_background` (fal BiRefNet, or self-hosted RMBG at `RMBG_URL`) and `upscale_image` (Real-ESRGAN through fal or self-hosted).
- Every media call logs real cost (per image or per second).

**Acceptance criteria:** a three-step edit conversation keeps consistency (fixture judged in the PR); cost rows are present.

---

## P3-12 Channels: Slack, Discord, email-in

**Spec**
- All channels go through `runTurn` (P2-12) with conversation keys.
- **Slack app:** Events API (`/webhooks/slack`, signing-secret check), app mentions and DMs, thread = conversation, approvals as Block Kit buttons, `/kemma` slash command. Account linking through an OAuth handshake to a Sutaeru user (one-time link code).
- **Discord bot:** interactions endpoint (signature verify) with slash commands `/ask`, `/research`; thread replies.
- **Email-in:** an inbound webhook (Mailgun routes, `/webhooks/email`, signature verify). Allowlisted sender address mapped to a user. Mail to `kemma@<domain>` → run → reply email with sources. Attachments go through the P2-06 parsing.
- Per-channel rate limits; all webhook secrets in env and documented.

**Acceptance criteria:** each channel answers a question, and the Slack approval button works (screenshots); signature verification has failure tests.

---

## Phase 3 exit criteria

| Metric | Target |
|---|---|
| Crash or restart during a run | Resumes, with no duplicate tool executions |
| Disconnect and reconnect | Full ordered replay |
| Research citation precision (standard) | ≥ 0.90 |
| Voice e2e latency p50 / barge-in stop | ≤ 1.2 s / ≤ 300 ms |
| Real per-user connectors working | ≥ 3 |
| Kemma MCP server | works from 2 external clients |
| BYOK spend excluded from platform cap | test passes |
| Custom agent by share link | tool intersection enforced |
