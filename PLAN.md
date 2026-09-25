# Sutaeru Master Plan — Stages A–G

Date: 2026-09-24. Status of the codebase as found, with file paths as evidence.
Legend: **exists** = working today · **partial** = some pieces exist · **missing** = nothing exists.

Hard rules for all stages: never print/log/change secrets or `.env`; never rebuild or restart
containers (a needed recreate is flagged, the user runs it); commit to git after each stage,
then pause for the user's "next".

---

## 0. Global safety rules (must hold in code)

| # | Rule | Status | Evidence / action |
|---|------|--------|-------------------|
| G1 | Agent can never delete, trash, share or change permissions on any file, local or Drive; such operations must not exist in any agent tool | **VIOLATION — must fix in Stage A** | Agent tool `safe_files` exposes `trash` (reversible copy to `to_be_deleted/`, `server/kemma/executors/safeFiles.ts:289`) and `purge` (permanent DB delete, bcrypt-gated, `safeFiles.ts:391`). No share/permission tool exists anywhere. Action: strip `trash`/`purge` from the agent tool schema (`server/kemma/tools.ts:35`); user-facing trash/restore returns in Stage D as UI-only actions. |
| G2 | Drive access limited to a root folder (`DRIVE_ROOT_FOLDER_ID`, default new folder "Sutaeru") and subfolders | **missing** | Drive is read-only listing today (`server/services/google.ts:11` scope `drive.readonly`, `:310 listDriveFiles`). Confinement logic lands in Stage E. |
| G3 | Editing an existing document requires user confirmation in the UI (showing the change), writes a new revision and a log entry | **partial** | Version archive on edit exists (`safeFiles.ts` edit → `users/{id}/archive/...`), `audit_logs` table exists (`drizzle/schema.ts:318`). No confirmation UI. Stage C/D. |
| G4 | Creating documents, saving generated files, moving files run directly but are logged | **partial** | `audit_logs` table exists but `generate_file` flow (`server/routers.ts:381-430`) writes no audit rows. Move = Drive, Stage E. |
| G5 | Google tokens stored securely, never logged | **partial** | Verified: no code logs token values (`server/routers/googleCallback.ts:30` logs the error object only). But tokens are stored **plaintext** in `google_tokens` (`drizzle/schema.ts:455-465`). Encryption at rest → Stage E. "Never logged" invariant holds. |
| G6 | Skills, sub-agents and settings cannot add tools or widen access | **exists** | Skills are prompt-text only with no executor (`server/routers/chat.ts:72-93`); no tool can change settings or permissions. Keep this invariant in Stage F/C2. |
| G7 | User settings (model, tool, skill choices) stored server-side; agent has no tool to change them | **missing** | No `user_settings` table; no settings storage. Stage C2. |

---

## 1. Stage A — Ports, login, models

### Items

| # | Item | Status | Evidence / action |
|---|------|--------|-------------------|
| A1 | App port bound to 127.0.0.1 | **missing** | `docker-compose.yml:9` publishes `"5000:5000"` on all interfaces, bypassing Caddy. Change to `127.0.0.1:5000:5000`. Caddy `80/443` (`docker-compose.yml:15-17`) stay public. **Needs container recreate — will tell you; you run it.** |
| A2 | Remove obsolete compose `version` key | **exists (to remove)** | `docker-compose.yml:1` `version: '3.8'`. |
| A3 | Disable all sign-up paths | **partial** | `auth.register` is public and open unless `BETA_MODE=true` (`server/routers.ts:118-162`, gate at `:126-129`). The signup tab is already hidden in the UI (`client/src/pages/Login.tsx:165-168`) but the endpoint is live. Action: env kill switch + allowlist; UI tab already gone. |
| A4 | Disable the Founder tab | **exists (to remove)** | Tab + form: `client/src/pages/Login.tsx:38-106, 165-168`. Procedure: `auth.founderLogin` `server/routers.ts:327-351`. Note: 7 seeded founder handles exist (`server/seed-founders.ts`); disabling handle-login locks them — see checkpoint A9. |
| A5 | `ALLOWED_LOGIN` env allowlist | **missing** | Nothing like it exists. Must gate **both** lookups of `auth.login` (email **or** @handle, `server/routers.ts:196-200`) and `auth.founderLogin` if kept. Comma-separated emails/handles. |
| A6 | Rate-limit login | **partial** | Ready-made limiters exist but are **imported nowhere**: `server/_core/rateLimiter.ts` (express-rate-limit; login 10/15min, register 5/hr, reset 5/hr), `server/middleware/rate-limiting.ts`. Wire into `server/_core/index.ts` / tRPC middleware. Also throttle `auth.check2faRequired` (`routers.ts:312-319`) — it is an account-enumeration oracle. |
| A7 | Gate forgot-password | **partial** | `auth.requestPasswordReset` is public and unthrottled (`routers.ts:213-226`); the client never calls it — the "Forgot password?" link (`Login.tsx:270-271`) is a dead end to `ResetPassword.tsx` (token half only). Action: allowlist + rate limit, or disable endpoint until UI exists. |
| A8 | No API route works without a session | **VIOLATION — must fix** | Public holes found: `openclaw.chat` (unauthenticated LLM proxy, `server/routers/openclawRouter.ts:19-84`), all 6 `agents.*` procedures (`server/routers/agents.ts:72-146`), `whatsapp.inbound` (`server/routers/whatsapp.ts:12`), `telegram.webhookInfo/test` (`server/routers/telegramRouter.ts:8-21`), Express routes `/api/atelier/*` and `/api/intelligence/*` with **no auth middleware** (`server/_core/index.ts:51-57`, `server/routers/atelier.ts:141,163,205`, `server/routers/intelligence.ts:36-63`), `profile.getByHandle`, `skills.getReviews` (`routers.ts:826,681`). `/api/kemma/stream` fails closed (401, `server/routes/kemmaStream.ts:10-11`). Intended public exceptions: `system.health`, Google OAuth callback, secret/HMAC-gated webhooks, share-link `fileSharing.getSharedFile`, auth endpoints themselves. Systemic fix: global auth-except-allowlist middleware in `server/_core/index.ts`. |
| A9 | **Checkpoint (step 0, before any file edit): report exactly which login stays allowed** | **process** | First action of Stage A is read-only: query `users`/`identities` (read-only SELECT via `docker compose exec` — not a restart — or a user-run one-liner) and list the seeded founder handles from `server/seed-founders.ts` (remy, donald, william, bash, mama_ida, angel, iownthis). I then state the exact proposed `ALLOWED_LOGIN` value and which procedures get disabled; **no edit is made until you approve that report**. `OWNER_OPEN_ID` admin path (`server/db.ts:57`) stays functional. |
| A10 | Router: all model names are `KEMMA_MODEL_*` env vars with defaults | **partial** | `MODELS` is a hardcoded `as const` (`server/core/kemmaRouter.ts:49-69`). Sub-items below. |
| A10a | search = `sonar-pro`, Sonar-only, throttled 40/min default, backoff on 429 | **partial** | `sonar-pro` exists (`kemmaRouter.ts:57`, `perplexityRoute` `:201`); Perplexity call is direct with no throttle/retry (`server/kemma/executors/webSearch.ts:166`). Add limiter + 429 backoff (env `KEMMA_SEARCH_RPM`, default 40). |
| A10b | page reading and summarizing = gemini flash | **partial** | `browse` tool renders pages via browser-use (`server/kemma/kemmaMax.ts:291`); summarization slot via gemini flash is new. |
| A10c | vision and documents = gemini flash | **exists** | `geminiVisionRoute` (`kemmaRouter.ts:251`), used by `engine.ts:168,233`, `phoneScan.ts:45`. |
| A10d | embeddings = gemini | **exists** | `geminiEmbeddingRoute` (`kemmaRouter.ts:265`), `server/services/vectorSearch.ts` (text-embedding-004). |
| A10e | images = `KEMMA_MODEL_IMAGE` (Gemini) | **missing** | Image gen today is DALL-E via LiteLLM (`server/_core/imageGeneration.ts:16`, `server/routers/imageGen.ts:18`). Switch provider to Gemini; Stage B persists bytes. |
| A10f | chat, tools, code, file generation = `qwen3.8-max` | **missing** | Qwen provider absent. Chat routes today: NVIDIA llama (`kemmaRouter.ts:51`) via `kemmaRoute`; the main Chat page actually streams through s1Router (`client/src/pages/Chat.tsx:200` → `server/routers/chat.ts` → `server/routers/s1Router.ts`) with no tools. Decision: kemma engine becomes the canonical chat surface (see Flags). |
| A10g | report writing = `KEMMA_MODEL_REPORT`, default `qwen3.8-max` | **missing** | Reports go through `generate_file` on whatever route `kemmaRoute` returns (`server/kemma/executors/generateFile.ts:18`). Add explicit report slot. |
| A10h | long documents and heavy browsing = `kimi-k3` | **missing** | Kimi endpoint exists (`kemmaRouter.ts:73`) with model `kimi-k2.5` (`:52`). Add long-doc slot with `kimi-k3` default. |
| A10i | planner = `KEMMA_MODEL_PLANNER`, citation verify = `KEMMA_MODEL_VERIFY`, both default `claude-sonnet-5`; verification always a different model than the writer | **missing** | No planner/verify stages exist; deep research is prompt-only (`server/kemma/kemmaMax.ts:618`). Add both stages; enforce `VERIFY ≠ writer` at runtime. |
| A10j | optional final polish = `KEMMA_MODEL_POLISH` via LiteLLM, only when you tick it | **partial** | LiteLLM convention exists (`server/llmProvider.ts:36,50`; `.env.example:20-21`). Opt-in flag + route missing. Replaces the current implicit final-step Sonnet polish (`kemmaRouter.ts:123-131`). |
| A10k | No Opus | **exists (to remove)** | `OPUS` const + thinking branch: `kemmaRouter.ts:54, 96-104`. |
| A11 | Fallback chain: qwen3.8-max → kimi-k3 → gemini flash → openai via LiteLLM (last resort) with a visible notice | **missing** | `callLLM` has no retry/fallback — any throw ends the run (`server/kemma/engine.ts:276-332`). A separate legacy chain exists in `server/llmProvider.ts:49-64`. Implement in engine; surface the notice via SSE (`server/routes/kemmaStream.ts` event). |
| A12 | Qwen provider: `QWEN_API_KEY`, `QWEN_BASE_URL` default `https://token-plan.maas.qwencloudapi.com/compatible-mode/v1` | **missing** | No Qwen anywhere. OpenAI-compatible via the existing fetch path in `callLLM`. |
| A13 | Remove all NVIDIA code except a slim Nemotron provider (`NVIDIA_API_KEY`, `KEMMA_MODEL_NEMOTRON`) | **partial** | NVIDIA used in `kemmaRouter.ts:51,72,111-190,314-336`; `server/llmProvider.ts:57`; `.env.example:26`-adjacent docs. Strip to a single nemotron route; delete `fetchNvidiaModels`/`checkModelAvailability`. |
| A14 | Monthly spend cap per provider (`KEMMA_CAP_ANTHROPIC`, `KEMMA_CAP_OPENAI`, USD) that blocks further calls with a clear message | **missing** | Only an aggregate `tokensToday` counter exists (`server/kemma/quotaCheck.ts:65`). Needs per-provider monthly totals (new table, see A15) + a block check in `callLLM`. |
| A15 | Log tokens and estimated cost per provider per report | **missing** | Tokens summed per step (`engine.ts:104-106`), dropped into `user_quotas.tokensToday`; no per-provider/per-report persistence; streaming drops usage (`engine.ts:325`). Add a `usage_logs` table (report/thread id, provider, model, tokens, est. cost). Pricing table = estimates. |
| A16 | All new vars in `.env.example` and `ENVIRONMENT_VARIABLES.md` with empty values | **partial** | Both files exist. **Warning:** `ENVIRONMENT_VARIABLES.md` (~lines 50–118) and `DEPLOYMENT_STATUS.md`/`DEPLOYMENT.md` contain committed live-looking secrets — rotate/redact (never reproduced here). We only *add* empty entries. |
| A17 | `DEEP_RESEARCH_ADDITION` wired into `personality.ts` | **exists — confirmed** | Defined `server/kemma/kemmaMax.ts:618`; imported `server/kemma/personality.ts:2`; appended at `personality.ts:64`; reaches prompts via `engine.ts:74-76`. |
| A18 | `npm run check` passes; fix `server/kemma` + `server/core`, list the rest | **partial (baseline known)** | Baseline: **297 errors**. `server/kemma` 12 (10 in `safeFiles.ts`, 2 `generateFile.ts`), `server/core/kemmaRouter.ts` 1. Others: `client/src` 249, `server/routers` 14, `server/services` 12, `server/seed-founders.ts` 5, `server/_core` 3, `server/routers.ts` 1. Root cause of most client errors: `server/routers.ts:478` assigns an Express Router into the tRPC app router → `AppRouter` type collapse (TS2339 ×141, TS7006 ×88). Also `safeFiles.ts:6` imports `bcrypt` which is not in package.json (only ad-hoc in the Docker image), and a TS1378 top-level-await/`tsconfig` target issue in `server/_core/index.ts`. |
| A19 | `scripts/smoke-test.sh` (login, one research question, cited answer) | **missing** | Precedent: `server/e2e.test.ts` (live-deployment smoke via vitest). New script: curl login → POST research → assert cited answer. |

### Dependencies
None — first stage. Everything else assumes the Stage A router, env conventions and auth lockdown.

### Risks
- **Lockout** → mitigated by checkpoint A9 (exact allowed login reported before applying) + keeping `OWNER_OPEN_ID`.
- Port change A1 needs a container recreate — flagged, user runs it.
- Disabling `trash`/`purge` agent actions makes parts of the system-prompt "File safety" text stale → update `personality.ts` in the same pass.
- Two chat surfaces (S1 `chat.ts` vs kemma engine) — model mapping only lands on the surface the UI uses; decision in Flags §10.
- Spend caps and cost logs depend on list prices; they are estimates, labeled as such.

### Milestone (testable)
1. `docker compose config -q` passes; from the host, `curl http://<public-ip>:5000/health` fails, `curl http://127.0.0.1:5000/health` succeeds, `https://sutaeru.com` still works.
2. `auth.register`, `auth.founderLogin`, `openclaw.chat`, `agents.*`, `/api/atelier/*`, `/api/intelligence/*` all return 401/403 without a session; login with a non-allowlisted email fails; 11 rapid logins → 429.
3. Router unit smoke: with empty env, `kemmaRoute` chat→qwen (`qwen3.8-max`), search→`sonar-pro`, vision→`gemini-2.0-flash`, long-doc→`kimi-k3`, planner/verify→`claude-sonnet-5`, verify ≠ writer enforced; fallback order observed in a forced-failure test; cap exceeded → clear block message.
4. `npm run check`: 0 errors in `server/kemma` + `server/core`; remaining errors listed in the commit message.
5. `scripts/smoke-test.sh` green: login → one research question → answer contains citations.

---

## 2. Stage B — Files

| # | Item | Status | Evidence / action |
|---|------|--------|-------------------|
| B1 | Swappable storage layer (local `/root/sr1-data/files` first, Drive later) | **partial** | Single hard-wired seam: `server/storage.ts` (Forge proxy `storagePut`/`storageGet`; `storageGet` returns a URL, not bytes — treated as content at `safeFiles.ts:178`, a latent type bug). No adapter interface, no local driver, no delete/list. Action: `StorageAdapter` interface + `LocalAdapter` (new dir + compose volume) + keep Forge as legacy driver. **Volume mount needs container recreate — flagged for you.** |
| B2 | `files` table: id, storage ref, type, thread, Space, date, size | **partial** | `drizzle/schema.ts:55`: has id, `fileKey`/`fileUrl` (storage ref), `format` enum, `mimeType`, `fileSizeBytes`, timestamps. Missing: `threadId`, `spaceId`, generic `kind`, `storageProvider`. New migration via `drizzle-kit` into `drizzle/migrations/` (note: migration layout is split-brain — MySQL-era files in `drizzle/` root, Postgres in `drizzle/migrations/`; `server/migrate.ts` runs only the latter). |
| B3 | Document generation end to end | **exists (re-point)** | `server/routers.ts:381-430` → `server/kemma/executors/generateFile.ts` → Forge `storagePut` → `files` row → client download link (`client/src/pages/Files.tsx:215`). Re-point to the new adapter; add audit row (G4). |
| B4 | Image generation tool using Gemini, saving to the Library | **partial** | Tool flow: `server/routers/imageGen.ts:18` → LiteLLM DALL-E (`server/_core/imageGeneration.ts:16`). Defect: bytes never copied to owned storage — `fileKey`/`fileUrl` point at the expiring upstream URL, `format: "md" as any`, size 0 (`imageGen.ts:34-55`). Action: Gemini image model (`KEMMA_MODEL_IMAGE`), fetch bytes → adapter → proper `files` row. |
| B5 | Video upload slot | **missing** | No endpoint anywhere. Nearest precedents: multer memory-only 20 MB parse at `server/routers/atelier.ts:205`; base64-in-tRPC uploads. Action: authenticated multipart endpoint with size cap + `files` row (`kind: "video"`). |

### Dependencies
Stage A (env conventions, router image slot, auth). Local dir + volume needs one recreate (you run it).

### Risks
Forge proxy removal changes download URLs (clients use the proxy URL, `Files.tsx:215`) — adapter must emit equivalent local URLs.
Migrations run on container start (`Dockerfile:43`); a bad migration breaks boot — test with `npm run db:migrate` logic locally first where possible.

### Milestone
Generate a PDF → row with new columns and bytes under `/root/sr1-data/files`; generate an image → Gemini model used, bytes persisted, listed in Files; upload a short video → slot works; adapter switchable by env without code change.

---

## 3. Stage C — Library and research quality

| # | Item | Status | Evidence / action |
|---|------|--------|-------------------|
| C1 | Library: all generated files, filter by type, search, preview, download, move, jump to source chat | **partial** | `client/src/pages/Files.tsx`: list, search, rename, hard delete (confirm dialog), download link. Missing: type filter, preview, move, jump-to-chat (needs `threadId` from B2). |
| C2 | Parallel sub-agents: up to 5, configurable, stateless, no memory or Drive tools | **missing** | Engine runs tool calls strictly sequentially (`server/kemma/engine.ts:112-125`); no sub-agent primitive. (`server/services/blendedAgents.ts` is a non-tool ensemble, unused by kemma.) Action: worker pool with a restricted toolset (search/browse only), no memory injection, cap 5 (env `KEMMA_MAX_SUBAGENTS`). |
| C3 | Full page reading | **exists** | `browse` tool via browser-use (`kemmaMax.ts:291`), 10k-char default truncation; summarization via gemini flash slot from A10b. |
| C4 | Configurable tool-call budget, default 60 for Deep Research | **partial** | Budget is a hardcoded per-tier const `MAX_TOOL_CALLS = {free:2, trial:20, pro:20, max:100}` (`kemmaMax.ts:602`), read at `engine.ts:81`. Make per-request/mode; Deep Research default 60 (env `KEMMA_TOOL_BUDGET`). |
| C5 | Citation verification pass checking each claim against its source | **missing** | `web_search` returns URLs (`webSearch.ts:166`) but the engine never tracks sources; no source list in `EngineOutput`. Action: collect sources per run, verification pass with `KEMMA_MODEL_VERIFY` (≠ writer), attach numbered citations to the answer. |

### Dependencies
B (files table + Library rows), A (router slots, usage logging).

### Risks
browser-use and E2B are external paid dependencies (`BROWSER_USE_API_KEY`, `E2B_API_KEY`) — sub-agent parallelism multiplies their cost; budget caps from A14 mitigate.
Citation verification adds latency per report; make it skippable per run.

### Milestone
A Deep Research run shows ≥2 parallel sub-agent traces (≤5), stops at the configured budget, and the final answer carries numbered citations each marked verified/failed; Library filters by type, previews, and jumps to the source chat.

---

## 4. Stage C2 — Selection controls

| # | Item | Status | Evidence / action |
|---|------|--------|-------------------|
| C2.1 | Model choice: Auto (router picks) or manual picker per message/thread; only providers with keys; relative cost tiers; Opus never listed | **missing** | `client/src/pages/Settings.tsx` is a 12-line stub; no picker anywhere. Needs key-presence detection (which `*_API_KEY`s are set) + a cost-tier table (from A15 pricing data). |
| C2.2 | Tool choice: per-mode defaults (Fast = search only; Deep Research = search/browse/sandbox; Document = documents+files; Image = image gen) with per-thread UI toggles; a disabled tool must not be registered at all for that run | **partial** | Engine offers the fixed 6-tool `KEMMA_TOOLS` array (`tools.ts:295-302`, offered at `engine.ts:95`); only mode UI is the "Max" toggle (`client/src/components/ChatHeader.tsx:120-149`). Action: per-run tool registration filtered by mode+toggles. Delete/trash/share tools never exist (G1). |
| C2.3 | Skill choice: auto-suggest approved skills; tag a skill on a message; pin skills to a Space; only approved selectable; used skills shown in agent-steps panel | **partial** | DB skill library + CRUD UI exist (`drizzle/schema.ts:220`, `server/routers.ts:632-691`, `client/src/pages/Skills.tsx`) and feed S1's prompt (`chat.ts:72-93`); kemma engine has zero skill integration (`server/kemma/skills/` is empty, `.gitkeep` only). Approval flag + tagging + steps-panel display are new (panel itself is Stage G). |
| C2.4 | Settings precedence: message > thread > Space > default | **missing** | No settings storage at all (G7). New server-side tables + resolution helper. |

### Dependencies
A (router), C (sub-agents/steps data). Stage D's Space table for pinning (ship D schema early or pin later — plan: add `spaceId` in B2, full Spaces in D).

### Risks
Per-message overrides need message-level metadata storage; keep the resolution helper pure and unit-tested.

### Milestone
Pick a model manually on a message → that model serves the reply (visible in steps); toggle a tool off → server log shows it was never registered; tag a skill → appears in the steps panel; override at message level beats thread beats Space beats default (test each layer).

---

## 5. Stage D — Spaces and chats

| # | Item | Status | Evidence / action |
|---|------|--------|-------------------|
| D1 | Spaces as project folders with per-Space context | **missing** | No table, no UI (only a Google-Workspace connection card and multi-business switcher, `client/src/components/DashboardLayout.tsx:277-346`). New `spaces` table + membership + Space-scoped chat sessions. |
| D2 | Search across chats and ask across chats using Gemini embeddings, always showing the source chat | **partial** | `chat_sessions`/`chat_messages` exist (`drizzle/schema.ts:293-318`). Embeddings infra exists but is memories-only (`server/services/vectorSearch.ts`, JSONB vectors + JS cosine; no pgvector). Extend to messages; source-chat attribution mandatory. |
| D3 | Export one thread (Markdown or PDF) or everything (zip of chats and files) | **missing** | No export code. `server/fileGenerator.ts` can render PDF. |
| D4 | Trash, restore and versions as UI actions only | **partial** | Backend-ish pieces: `safe_files` versions/trash/archive (`safeFiles.ts`), `files.trashed` columns (`schema.ts:55`); but `Files.tsx` hard-deletes and there is no restore UI. Rebuild as UI-only actions on the user surface; agent keeps no such tools (G1). |

### Dependencies
B (`spaceId` on files), C (Library), C2 (pinning targets).

### Risks
`server/db.ts:868 searchMemories` uses MySQL `MATCH ... AGAINST` that won't run on Postgres — fix while extending search.

### Milestone
Create a Space, move chats/files in, ask a question across chats → answer cites source chats; export a thread to MD/PDF; trash a file → restore it from UI → see versions.

---

## 6. Stage E — Google Drive

| # | Item | Status | Evidence / action |
|---|------|--------|-------------------|
| E1 | OAuth on your personal account, app "In production"; exact console steps for you | **partial** | OAuth exists (`server/services/google.ts`, callback `server/routers/googleCallback.ts`); scope is `drive.readonly` (`google.ts:11`) — write access needs a scope change and your re-consent; OAuth `state` is an in-memory Map (`google.ts:35`) lost on restart — move to signed cookie. Console steps to be delivered at implementation. |
| E2 | Storage layer switches to Drive: generated files go straight to Drive under the root folder, organized by Space and type | **missing** | No Drive write code exists anywhere. Built on the Stage B adapter (`DriveAdapter`), confined to `DRIVE_ROOT_FOLDER_ID` (G2), folder-per-Space/type. |
| E3 | Library indexes Drive files with a small local cache | **missing** | Sync job + cache table. |
| E4 | Visible error + automatic retry on failure; Reconnect Drive button when authorization fails; low-space warning | **missing** | All new UI + refresh-token error detection (today's refresh path `google.ts:111-131` has no UX). |
| E5 | Agent Drive tools in our own code: search, read, create, edit (with confirmation), move. No delete/share/permission tools — ever | **missing** | Implemented in our own service layer; delete/share/permission tools do not exist and will not be added. |
| E6 | Drive MCP connector evaluation: report exposed tools; do not use if delete/sharing cannot be turned off | **process** | No MCP Drive connector present. If one is considered, produce a tool-list report first; default remains our own E5 tools. |
| E7 | Token security (G5) | **partial** | Tokens plaintext in `google_tokens` (`schema.ts:455-465`); add encryption at rest (key from env/secret file); never log. |

### Dependencies
B (storage adapter), D (Spaces organization), A (auth hardening).

### Risks
Scope change invalidates existing grants; personal-account storage quota → low-space warning is mandatory; Drive API rate limits on bulk Library sync.

### Milestone
With Drive connected: generate a document → file appears in Drive under `Sutaeru/<Space>/<type>/`, Library lists it from cache; revoke access → Reconnect button appears; agent search/read/create/edit(with confirm)/move work; verify no delete/share/permission tool exists in the registered toolset.

---

## 7. Stage F — Skills

| # | Item | Status | Evidence / action |
|---|------|--------|-------------------|
| F1 | Read-only-to-the-agent `/root/sr1/skills/` with `SKILL.md` per skill (name, description, when to use, steps) | **missing** | `server/kemma/skills/` exists but empty (`.gitkeep` only). New dir + loader. |
| F2 | At task start the agent lists names/descriptions, picks relevant ones, follows them | **missing** | Loader + selection step in the engine before the loop. |
| F3 | Review step (separate Claude call): reports what each candidate skill instructs, tool/file access requested, hidden/obfuscated text, rule-override attempts; verdict approve/review/reject | **missing** | New review service using `KEMMA_MODEL_VERIFY`'s provider (Claude). |
| F4 | Nothing installs automatically; you tap to enable each after seeing the report | **missing** | Approval store (server-side, G7) + UI list with verdicts. |
| F5 | Four starter skills: market brief, investor summary, research report with citations, project cost breakdown | **missing** | Author as `SKILL.md` files. |
| F6 | Relation to existing DB skills (`skills` table, S1 prompt injection, `client/src/pages/Skills.tsx`) | **decision** | Keep DB skills for the S1 surface; file skills are the kemma-agent system. Consolidation optional later. |

### Dependencies
A (Claude model for review), C2 (approval gating UI patterns).

### Risks
Skills are prompt content — the review step is the only defense against prompt injection; keep the reviewer model different from the executor where possible.

### Milestone
Drop a new `SKILL.md` into `/root/sr1/skills/` → review report appears with verdict; enable it → next relevant run follows it and the steps panel shows it; the four starter skills pass review and are enabled.

---

## 8. Stage G — UI

| # | Item | Status | Evidence / action |
|---|------|--------|-------------------|
| G1 | Opera Neon visual language: cream/black panels, pill buttons/tabs, crosshair marks at grid corners, monospace caps labels, flat pastel tag chips, orange accent only for active steps/status dots | **missing** | Three visual languages coexist today: Mocha tokens (`client/src/index.css:52-181`), dark-navy `client/src/styles/sutaeru-os.css`, blue/purple glass in `DashboardLayout.tsx:79-85`, plus `client/src/lib/design.ts`. Consolidate into one token set. Asset: `design_changes/` holds 42 restyled pages + README targeting a cream "Sutaeru OS Board" system — usable as reference, not wired in. |
| G2 | Exact existing Sutaeru logo, fonts and colors from the login page | **exists** | Logo = inline `SLogo` SVG (`client/src/pages/Login.tsx:28-36`); unused assets `client/public/logo.svg`, `components/Logo.tsx`, `components/SutaeruLogo.tsx`. Fonts actually loaded: DM Serif Display, DM Mono, Inter (`client/index.html:42`, `index.css:55-56`). Palette: `--bg:#f5efe7`, `--t1:#1e150d`, `--mocha:#A47764`, `--amber:#e8913a` (`index.css:52-80`). |
| G3 | Modes: Fast, Deep Research, Image, Document | **partial** | Only "Max" toggle (`ChatHeader.tsx:120-149`); `/image-gen`, `/generate`, `/atelier` are separate pages. Unify into a chat mode selector. |
| G4 | Agent-steps panel | **missing** | SSE `agent` event is received but unused (`client/src/pages/Chat.tsx:63, 251-252`); kemma stream emits `tool_start/tool_end/model` (`server/routes/kemmaStream.ts`) — render them. |
| G5 | Source cards with numbered citations | **missing** | Depends on C5 source tracking. |
| G6 | Follow-up chips | **missing** | Only static empty-state cards (`ChatEmptyState.tsx`). |
| G7 | Mobile layout with bottom tab bar | **missing** | Mobile = top bar + sidebar sheet (`DashboardLayout.tsx:633-646`). |
| G8 | Cost and usage view per report | **missing** | Depends on A15 `usage_logs`. |

### Dependencies
A (cost data), C (citations), C2 (controls), D (Spaces), E (Drive states), F (skill display). Last stage.

### Risks
Full reskin touches ~60 components; do it token-first (CSS variables) so component churn stays mechanical. `design_changes/` copies must not be bulk-copied back without review (they contain a stale `HerSettings.tsx`).

### Milestone
Visual review against the Neon spec (cream/black, pills, crosshairs, mono caps, pastel chips, orange only for active); all four modes work in one chat; steps panel shows tools/models/skills live; answers show numbered source cards; follow-up chips appear; mobile bottom bar navigates; per-report cost view matches `usage_logs`.

---

## 9. Dependency graph and order

```
A (ports/auth/router/env/checks) ──► B (storage/files) ──► C (library/research)
                                     │                        │
                                     ▼                        ▼
                                     D (spaces/chats) ◄── C2 (controls)
                                     │
                                     E (Drive) ──► F (skills) ──► G (UI)
```
- A needs one container recreate (port binding) — you run it.
- B needs one recreate (new volume for `/root/sr1-data/files`) — you run it.
- E needs your Google console work + re-consent.
- F technically only needs A; slotted after E to reuse the skills UI patterns.

## 10. Flags you should know before "go"

1. **Committed secrets:** `ENVIRONMENT_VARIABLES.md` (~lines 50–118), `DEPLOYMENT_STATUS.md`, `DEPLOYMENT.md` contain live-looking keys/passwords in git history. Recommend rotation + redaction. We will never print them.
2. **Founder accounts:** disabling the Founder tab + `founderLogin` locks out 7 seeded handles (`server/seed-founders.ts`). Allowlist login will be email-based; checkpoint A9 reports your exact allowed login before anything is applied.
3. **Two chat surfaces — DECIDED (user, pre-go):** the kemma engine is the canonical chat surface. The main Chat page (`server/routers/chat.ts` + `s1Router.ts`) keeps working through Stage B; the UI is re-pointed to the kemma surface in Stage C (before Deep Research features land); S1 is converged/retired in C2/G.
4. **`npm run check` root cause:** one line (`server/routers.ts:478`) collapses `AppRouter` typing and causes ~229 of the 297 errors. Brief says fix `server/kemma`+`server/core` and list others — but fixing that one line may be cheap and high-value; decide at Stage A.
5. **Webhooks** (Telegram/WhatsApp/Meta) must stay reachable without a session — they will be secret/HMAC-gated rather than session-gated.
6. **Docker compose drift:** docs describe Coolify/Traefik, the repo ships Caddy; `docker-compose.yml` is currently modified-but-uncommitted and `Caddyfile` untracked.

## 11. Stage A login checkpoint (expanded)

Before any lockdown is applied I will, read-only: list `users`/`identities` rows, identify your account (email + any handle, cross-checked with `OWNER_OPEN_ID`), and report exactly: which login stays allowed, which procedures get disabled (`register`, `founderLogin`, `requestPasswordReset` gate), and what the rate limits will be. Nothing changes until you confirm that report.

---

*Plan ends. Awaiting "go" to begin Stage A (one stage at a time, commit after each, pause for "next").*
