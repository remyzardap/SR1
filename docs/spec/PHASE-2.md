# Phase 2: memory, files, options

**Goal:** Kemma remembers what matters, reads any file at any size cheaply, lets users choose from many models and modes, sees images natively, keeps a stateful sandbox, and every channel runs the same brain.

**Work packages:** 12. **Estimated total:** about 30 agent-days; about 12 calendar days with 3 lanes in parallel.

| ID | Title | Size | Depends on | Lane |
|---|---|---|---|---|
| P2-01 | pgvector, Phase 2 schema, DB image | M | Phase 1 | gate |
| P2-02 | Embedding service and backfill | M | P2-01 | A |
| P2-03 | Hybrid retrieval and rerank | M | P2-02 | A |
| P2-04 | Memory v2 (automatic, reconciled, tiered) | L | P2-03 | A |
| P2-05 | Conversation search | S | P2-03 | A |
| P2-06 | Document parsing pipeline | L | P2-01 | B |
| P2-07 | Large-file retrieval, thread files and space files | M | P2-03, P2-06 | B |
| P2-08 | Model registry and user model picker | M | P2-01 | C |
| P2-09 | Modes and intent router (incl. Council and Private) | L | P2-08 | C |
| P2-10 | Native multimodal messages | M | P2-08 | C |
| P2-11 | Persistent sandbox and file outputs | M | Phase 1 | B |
| P2-12 | One engine for every channel and a typed event protocol | L | P2-09 | C |

---

## P2-01 pgvector, Phase 2 schema, DB image

**Why:** memory search scans every row in JavaScript (`server/services/vectorSearch.ts:178`), embeddings sit in JSON columns, and the compose database image (`postgres:16-alpine`) doesn't include pgvector.

**Files**
- create `ops/postgres/Dockerfile`, `ops/postgres/README.md` (runbook)
- create `drizzle/migrations/0026_phase2_knowledge.sql` (journaled) and `drizzle/optional/pgvector.sql`
- edit `server/migrate.ts`, `drizzle/schema.ts`, `docker-compose.yml` (postgres `build:` only)
- create `server/core/dbCapabilities.ts`

**Spec**
1. **DB image:** `FROM postgres:16-alpine`, then build pgvector at a pinned tag (v0.8.x: `apk add --virtual .build git build-base clang llvm`, `make && make install`, `apk del .build`). Stay on alpine, because switching the existing data volume to a Debian-based image risks collation differences between musl and glibc.
   The runbook (`ops/postgres/README.md`) states the **owner's steps**: `pg_dump` backup → `docker compose build postgres` → `docker compose up -d postgres` → check with `SELECT extname FROM pg_extension` → keep the backup 7 days. Also cover the managed-DB path (D4): run `CREATE EXTENSION vector` in the provider console.
2. **Capability detection:** `migrate.ts` checks `SELECT 1 FROM pg_available_extensions WHERE name='vector'`.
   - If available: run `drizzle/optional/pgvector.sql` (idempotent) after the journaled migrations.
   - If not: log a warning and continue.

   `dbCapabilities.ts` exposes `hasPgvector(): Promise<boolean>`, cached and read from `pg_extension`.
3. **Journaled migration `0026`** (no vector types, so it works everywhere):
```sql
ALTER TABLE memories ADD COLUMN IF NOT EXISTS status varchar(16) NOT NULL DEFAULT 'active';   -- active|superseded|deleted
ALTER TABLE memories ADD COLUMN IF NOT EXISTS tier varchar(16) NOT NULL DEFAULT 'episodic';   -- core|episodic
ALTER TABLE memories ADD COLUMN IF NOT EXISTS superseded_by integer;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS confidence real;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS space_id varchar(36);
ALTER TABLE memories ADD COLUMN IF NOT EXISTS last_used_at timestamp;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS use_count integer NOT NULL DEFAULT 0;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding_json jsonb;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding_model varchar(96);
ALTER TABLE memories ADD COLUMN IF NOT EXISTS tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title,'') || ' ' || content)) STORED;
CREATE INDEX IF NOT EXISTS memories_tsv_idx ON memories USING gin (tsv);
CREATE INDEX IF NOT EXISTS memories_identity_status_idx ON memories ("identityId", status);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  scope_type varchar(16) NOT NULL,          -- file|chat|space|run|agent
  scope_id varchar(64) NOT NULL,
  source_ref varchar(256) NOT NULL,         -- sha256, message id, url
  source_title text,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  token_count integer NOT NULL,
  embedding_json jsonb,
  embedding_model varchar(96),
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,   -- page, heading, url, published_at
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (user_id, scope_type, scope_id, source_ref, chunk_index)
);
CREATE INDEX IF NOT EXISTS kc_scope_idx ON knowledge_chunks (user_id, scope_type, scope_id);
CREATE INDEX IF NOT EXISTS kc_tsv_idx ON knowledge_chunks USING gin (tsv);

CREATE TABLE IF NOT EXISTS parsed_documents (
  sha256 char(64) PRIMARY KEY,
  mime varchar(128) NOT NULL,
  parser varchar(32) NOT NULL,
  page_count integer,
  markdown text NOT NULL,
  pages jsonb,                               -- [{n, chars, ocr:boolean}]
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session_files (
  session_id varchar(36) NOT NULL,
  user_id integer NOT NULL REFERENCES users(id),
  sha256 char(64) NOT NULL,
  filename text NOT NULL,
  mime varchar(128) NOT NULL,
  storage_key text,                          -- original bytes, for the sandbox (P2-11)
  indexed boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, sha256)
);

CREATE TABLE IF NOT EXISTS memory_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  memory_id integer,
  op varchar(16) NOT NULL,                   -- add|update|delete|noop|used
  before text, after text,
  source varchar(32) NOT NULL,               -- auto|tool|user
  session_id varchar(36),
  created_at timestamp NOT NULL DEFAULT now()
);
```
4. **`drizzle/optional/pgvector.sql`** (idempotent):
```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding vector(1024);
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding vector(1024);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS embedding_vec vector(1024);
CREATE INDEX IF NOT EXISTS memories_embedding_hnsw ON memories USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS kc_embedding_hnsw ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
```
   The `vector` columns aren't declared in `schema.ts`. Access them through raw `sql` in the retrieval layer only, so that type generation works without the extension.

**Tests:** `migrate.db.test.ts` (in CI `db-tests`): apply on a fresh pgvector DB twice, then apply on plain Postgres (a second service container, `postgres:16-alpine`) and assert the optional step is skipped cleanly.

**Acceptance criteria:** AC1: both DB variants migrate. AC2: the runbook was reviewed by Claude and includes backup and rollback. AC3: no change to app behavior yet.

---

## P2-02 Embedding service and backfill

**Files:** create `server/services/embeddings/{index,gemini,openaiCompat,tei}.ts` and tests; create the `embeddings-backfill` job; edit `server/services/vectorSearch.ts` (becomes a thin compatibility wrapper).

**Spec**
- `embedTexts(texts: string[], { purpose: "query" | "document" }) → { vectors: number[][]; model: string; dims: 1024 }`. Batch up to 100 texts per call. Cache in `kv_cache` namespace `emb` by `sha256(model + purpose + text)` for 30 days.
- Providers, selected by `EMBEDDINGS_PROVIDER`:
  - `gemini` (default, existing auth paths; set the task type for query vs. document)
  - `openai-compat` (LiteLLM gateway or OpenAI / Voyage / Cohere through `EMBEDDINGS_BASE_URL` + `EMBEDDINGS_MODEL`; pass `dimensions: 1024` where supported)
  - `tei` (self-hosted text-embeddings-inference at `EMBEDDINGS_TEI_URL`, for BGE-M3 or Qwen3-Embedding)
- **Dimension rule:** stored vectors are always 1024 long and L2-normalized.
  - Shorter native output (e.g. 768): zero-pad, which preserves cosine similarity between vectors of the same model.
  - Longer output from Matryoshka-trained models (Gemini, OpenAI 3, Voyage, Qwen3-Embedding): truncate to 1024, then re-normalize.
  - A non-Matryoshka model that's longer than 1024 is refused at startup.
- `embedding_model` is saved with every vector, and **queries only compare vectors with the same `embedding_model`**.
- The backfill job (pg-boss, batch 200, resumable through a cursor in `kv_cache`) embeds:
  - every `memories` row without `embedding_model = current` (also copies `structuredData.embedding` where it's the current model)
  - every `chat_messages` row with content longer than 20 characters (only when `FF_CONVERSATION_SEARCH` is on)

  It writes `embedding_json` plus `embedding` (vector) when pgvector exists. Started with `npm run jobs:backfill-embeddings` or the admin tRPC `admin.backfillEmbeddings`.
- Usage rows with `purpose="embedding"`.

**Tests:** padding and truncation keep cosine order; normalization; the same-model filter; provider request mapping with fixtures; batching; cache hit; backfill cursor resumes after a simulated crash.

**Acceptance criteria:** AC1: backfilling 10k rows on a dev DB finishes without errors; the time is reported. AC2: retrieval quality on the P2-04 memory eval is at least as good as before (same model, so a sanity check).

---

## P2-03 Hybrid retrieval and rerank

**Files:** create `server/services/retrieval/{index,rerank,rrf}.ts`, tests and `retrieval.db.test.ts`.

**Spec**
```ts
hybridSearch({ userId, corpus: "memories" | "chunks", scopes?: Array<{type, id}>, query, k = 8,
               filters?: { status?: string; spaceId?: string }, rerank?: boolean, signal? })
  → Array<{ id; content; score; source: { type, id, ref, title, metadata } }>
```
- **Vector leg:** with pgvector, `ORDER BY embedding <=> $q LIMIT 50`, filtered by user, scope, model and status. Without pgvector, a JS cosine over `embedding_json` **only when the candidate set is under 5,000 rows**; otherwise skip the vector leg and log `retrieval_vector_skipped`.
- **Keyword leg:** `ts_rank_cd(tsv, websearch_to_tsquery('simple', $q))`, top 50.
- **Fusion:** RRF (k=60), then an optional rerank of the top 30 → k. `RERANK_PROVIDER` = `off` (default) | `cohere` | `jina` | `voyage` | `tei` (bge-reranker-v2-m3 or Qwen3-Reranker). Rerank has a timeout of 1.5 s and falls back to the RRF order.
- Never returns another user's rows (every query has `user_id = $1`; tests prove it).

**Tests (db):** seeded corpus, keyword-only query finds the exact term, semantic paraphrase found through the vector leg, fusion beats either leg on a 30-query mini set (assert recall@5 of fusion ≥ max(single legs)), user isolation, no-pgvector fallback path.

**Acceptance criteria:** AC1: tests pass. AC2: p95 latency under 120 ms for 100k chunks with pgvector (synthetic data, reported in the PR; rerank off).

---

## P2-04 Memory v2 (automatic, reconciled, tiered)

**Why:** extraction only runs when the client calls `/api/fn/memories` `extract` (`Chat.tsx`). Nothing dedupes, updates or forgets.

**Files**
- create `server/kemma/memory/{extract,reconcile,inject,tools}.ts` and tests
- edit `server/kemma/memory.ts` (it delegates), `server/routes/kemmaStream.ts` (enqueue after persist), `server/routes/fn/memories.ts` (`extract` stays for compatibility but the server path takes over), `server/kemma/engine.ts` (injection and `memories_used` event)
- client: remove the `void (async () => { … extract … })` block in `Chat.tsx`, and add a small "memories used" chip

**Spec**
1. **Trigger:** after each persisted assistant turn, enqueue `memory-extract { userId, sessionId, upToMessageId }`, debounced to once per session per 2 minutes (singleton key). Skip when living memory is off (`LIVING_MEMORY_KEY`) or the session is Private mode (P2-09).
2. **Extract:** a cheap model with a strict JSON schema produces candidates `[{ type, content, tier_hint: "core"|"episodic", confidence 0..1 }]` from the last 8 messages (existing prompt, extended).
   - Drop candidates with confidence below 0.6.
   - Drop anything `lib/sensitive.ts` flags, and secrets (API keys, passwords, card numbers; regex set).
3. **Reconcile** each candidate: `hybridSearch(memories, k=5)`, then one LLM call returns `{ op: "ADD" | "UPDATE" | "DELETE" | "NOOP", target_id?, new_content? }`.
   - Apply it in a transaction. UPDATE sets the old row's `status='superseded'` and `superseded_by`, and inserts a new row. DELETE sets `status='deleted'` (soft).
   - Write `memory_events`.
   - Embed new rows (P2-02).
4. **Tiers:** core memories are at most 20 items and 600 tokens. When over the limit, demote the least-used core items to episodic.
5. **Injection** on each turn, through `dynamicContext` (keeps the prompt-cache prefix):
   - `## About the user` (core, always included)
   - `## Possibly relevant` (episodic, `hybridSearch` k=6, score above a threshold)

   Increment `use_count` and `last_used_at`. Emit SSE `memories_used [{ id, content }]`.
6. **Tools:**
   - `memory_search {query}` (read)
   - `memory_save {content, type}` (write, no approval; source `tool`)
   - `memory_forget {id}` (write, **approval**; soft delete)
7. **Retention:** episodic memories unused for 180 days with confidence below 0.8 become `status='deleted'` (monthly job), logged in `memory_events`.

**Tests:** extraction filter (sensitive, low confidence); reconcile ops applied correctly with a fake LLM, including UPDATE chains; tier cap demotion; injection cap; private mode skip; living memory off means no job; the tools.

**Eval (new, `evals/memory/`):** 50 scripted conversations that seed facts, change some of them later ("I moved to Lisbon"), then ask 50 questions.

**Acceptance criteria:** AC1: recall at least 85% on the eval. AC2: stale-fact answers at most 5% (answers using a superseded fact). AC3: duplicate active memories at most 5% after the script runs.

---

## P2-05 Conversation search

**Files:** create `server/kemma/toolkit/builtin/conversationSearch.ts`, an indexing job, tests.

**Spec**
- Behind `FF_CONVERSATION_SEARCH`. Index the user's `chat_messages` into `knowledge_chunks` (scope `chat`, scope_id = session id; one chunk per message, or split at about 800 tokens). Indexing happens in the background after persist, batched.
- Tool `conversation_search {query, k?}` (read) returns `[{ sessionTitle, date, role, snippet, sessionId }]`.
- Deleting a session deletes its chunks (hook into the existing delete-session path).

**Acceptance criteria:** "what did we decide about X last week" finds the right session in a seeded test; deleted sessions aren't findable.

---

## P2-06 Document parsing pipeline

**Why:** every PDF goes whole to a vision model on every request (`server/lib/fnDocument.ts:81`), and many common formats aren't accepted.

**Files:** create `server/lib/parse/{index,pdf,ocr,office,sheet,slides,html,code,audio}.ts` with fixtures and tests; edit `server/lib/fnDocument.ts` and `server/lib/attachments.ts` (accept new types, use `parseFile`), `package.json` (`unpdf` from P1-09, `jszip`).

**Spec**
- `parseFile({ bytes, filename, mime, userId, signal }) → { markdown, pages?, tables?, meta, parser, sha256 }`. It checks `parsed_documents` by sha256 first.
- **PDF:**
  - Text layer per page through `unpdf`.
  - Pages with fewer than 40 characters, or mostly unreadable glyphs, are OCR candidates.
  - OCR provider by `OCR_PROVIDER`:
    - `docling` (self-hosted Docling Serve at `DOCLING_URL`; recommended: layout, tables, open source)
    - `mistral` (Mistral OCR API)
    - `vision` (the existing Gemini path, but **only for the candidate pages**: split them out with `pdf-lib`, or send the page range)
    - `off`
  - Over 300 pages → parse the first 300 and set `meta.truncated`.
- DOCX: keep the current extractor (`extractDocx`), output as markdown.
- XLSX/CSV: `exceljs` (CSV through a small RFC 4180 parser) → per sheet, markdown tables capped at 200 rows × 30 columns, plus `meta.sheets[{name, rows, cols}]`. The original bytes are kept for the sandbox (P2-11).
- PPTX: unzip slides plus notes XML → `## Slide n` sections.
- HTML: the reader's extract step from P1-09.
- Code and text by extension (`.ts .py .js .json .yaml .sql .md .txt .log` and others): fenced code blocks.
- Audio (`mp3 m4a wav ogg webm`, at most 25 MB): the existing ElevenLabs STT (`fnVoice.speechToText`) → transcript markdown; checks the `voice_minute` quota.
- Images: unchanged (vision description, or native in P2-10).
- Limits: `ATTACH_MAX_MB` default raised to 25 for documents. The 20k/60k character context caps stay. Large files go through P2-07 instead of being truncated.
- Usage rows for OCR (per page) and STT (per minute).

**Tests:** fixtures for each format (text PDF, scanned PDF page, mixed PDF, xlsx with 2 sheets, csv with quotes, pptx with notes, html, code, short audio with mocked STT); cache hit means no provider call; OCR is only invoked for candidate pages.

**Acceptance criteria:** AC1: text-layer PDFs make zero LLM/OCR calls (usage rows asserted). AC2: on a 10-document fixture set, the markdown contains all ground-truth key phrases. AC3: estimated parsing cost on the bench set drops at least 80% against `BASELINE.md`.

---

## P2-07 Large-file retrieval, thread files and space files

**Files:** create `server/kemma/files/{index,chunk,manifest}.ts` and `server/kemma/toolkit/builtin/fileSearch.ts`; edit `server/lib/attachments.ts`, `server/routes/kemmaStream.ts`, `server/routers/spaces.ts` (attach files to a space).

**Spec**
- When an attachment's parsed markdown is longer than `MAX_FILE_CONTEXT_CHARS`:
  - Chunk it by heading, then paragraph, at about 800 tokens with 100 overlap, keeping `metadata.page` and `metadata.heading`.
  - Embed it into `knowledge_chunks` (scope `file`, scope_id = sha256), and record it in `session_files`.
  - The prompt gets a **manifest** instead of the text: filename, page count, outline (headings), the first 1,500 characters, and the instruction "use file_search to read more".
- `file_search {query, files?: string[], k?}` (read, parallelSafe): searches the session's files plus its space's files and returns chunks with page and heading so the answer can cite `(report.pdf, p. 12)`.
- Files persist per thread: follow-up turns in the same session list `session_files` in the manifest without re-upload.
- **Space files:** `spaces.addFile/removeFile` tRPC. Files attached to a space are indexed with scope `space` and are searchable in every chat of that space.
- Small files keep today's behavior (full text in context).

**Tests:** a 300-page synthetic PDF → manifest in context and correct chunk retrieval for 10 questions; follow-up turn without re-upload; space scope; user isolation.

**Acceptance criteria:** on the 200-page fixture QA set (20 questions with known answers), accuracy is at least 80% and input tokens are at least 70% lower than stuffing the full text.

---

## P2-08 Model registry and user model picker

**Why:** the model list is hand-coded in three places (`ROUGH_PRICES_USD_PER_1M`, `listAvailableModels`, `MODEL_LIMITS`), fallback isn't capability-aware, and `settings.ts` ignores the user's choice.

**Files:** create `server/config/models.ts` and its test; edit `server/core/kemmaRouter.ts`, `server/kemma/settings.ts`, `server/routers/kemma.ts` (`availableModels`), `server/core/usage.ts` (prices), client `Chat.tsx` picker (it already queries `availableModels`).

**Spec**
```ts
export interface ModelSpec {
  id: string;                 // what callers pass, e.g. "litellm/claude-sonnet-5-5", "qwen3.8-max"
  label: string; family: string; description: string;
  provider: ModelProvider;    // existing detectProvider result must match
  contextWindow: number; maxOutput: number;
  caps: { tools: boolean; vision: boolean; audioIn: boolean; jsonSchema: boolean; reasoning: boolean; promptCache: boolean };
  price: { inPer1M: number; outPer1M: number; cachedInPer1M?: number };
  tiers: Tier[];              // who may pick it
  adminOnly?: boolean;        // Venice stays admin-only
  privacy: "standard" | "private";   // private = self-hosted or no-retention provider (Private mode)
  speed: "fast" | "standard" | "slow";
  enabled: () => boolean;     // key or gateway present, plus the optional MODELS_DISABLED list
}
```
- Seed the registry with the current models (Qwen, Gemini Flash/Pro, Sonar, Venice) and **gateway models disabled unless configured** (D6): Claude Opus 5.5, Sonnet 5.5, Haiku 4.5; a GPT-5-class model; DeepSeek V3.x and R1; Kimi K2; GLM-4.6; Llama 4; gpt-oss-120b; Qwen3-Coder. **Verify each id and its prices against the gateway's `/models` and price map**, and record the source in a comment.
- `MODELS_EXTRA_JSON` env lets the owner add models without a deploy.
- `callChainFor(route, required: Partial<caps>)`: the fallback chain only includes models that have the required capabilities (tools when tools are offered; vision when image parts are present).
- `estimateCostUsd` reads the registry prices (keep the existing function signature).
- `resolveSettings`: with `flag("USER_MODEL_PICKER")` on, accept `message.model ?? thread.model` when the model exists, is enabled, the user's tier is in `tiers`, and admin-only is respected. Otherwise use `auto`. **This reverses the current "the model is chosen by us" policy, by decision D5.**
- `kemma.availableModels` returns `{ id, label, family, description, caps, speed, priceBand: "$"|"$$"|"$$$", locked: boolean (tier) }`.

**Tests:** tier gating; capability-aware chain (no non-tool model in the chain when tools are needed); price lookup with the provider prefix; `MODELS_EXTRA_JSON` parsing and validation; admin-only enforcement unchanged.

**Acceptance criteria:** AC1: at least 8 models are selectable when the gateway is configured (screenshot). AC2: a forced primary failure falls back only to capable models (test).

---

## P2-09 Modes and intent router (incl. Council and Private)

**Files:** create `server/kemma/modes.ts` and `server/kemma/router/{classify,heuristic}.ts` with tests; create `server/kemma/council.ts` (port of `s1Blend` logic from `server/routers/s1Router.ts`); edit `server/kemma/engine.ts` (`selectRoute` replaced), `server/kemma/settings.ts` (`ChatMode` extended), `server/routers/kemma.ts` (`availableModes`).

**Spec**
- **Modes** (a table in `modes.ts`): for each mode, `{ label, description, defaultModel (slot or id), tools (allowlist), toolBudget, maxSteps, reasoningEffort, subagents, maxOutput, tiers }`.

| Mode | What it is | Defaults |
|---|---|---|
| `auto` | Router picks the mode and model per message | |
| `fast` | Cheap fast model | tools: web_search, browse, memory_*, generate_image; budget 6 |
| `think` | Reasoning model, high effort | same tools as fast; budget 12 |
| `research` | Planner + sub-agents (the P3-04 orchestrator once it lands; until then the existing research path) | |
| `agent` | All available tools, long budget (60), maxSteps 40 | moves to a background run in P3-01 |
| `council` | Several models answer in parallel, then one synthesis or judge pass, streamed | 3 drafts by default, configurable through `COUNCIL_MODELS`; drafts at most 1,200 tokens each; max tier only |
| `private` | Only `privacy: "private"` models (Venice or self-hosted vLLM at `PRIVATE_BASE_URL`) | web tools limited to SearXNG if configured; no third-party MCP tools; no memory extraction |

- Existing modes `document` and `image` map onto these: `document` → `agent` with the file tools; `image` → `fast` with `generate_image` first.
- **Auto router:**
  - First, the cheap classifier (`ROUTER_MODEL`, default the registry's fastest enabled model with `jsonSchema`; 600 ms timeout). Output: `{ intent: chat|lookup|research|code|data|write|image|video|action, difficulty: 1-5, needs_web: bool, needs_files: bool }`.
  - On timeout or error: `heuristic.ts`, an improved `detectComplexity` that no longer treats "all", "every", "design" or "document" alone as complex.
  - The mapping table from intent and difficulty to mode and model lives in `modes.ts`, where it's easy to tune.
  - The classification is cached by message hash for 10 minutes.
  - Emit SSE `route { mode, reason }` (shown as a small chip; the model label stays hidden unless the user picked it).
- **Council:** draft calls run in parallel with the P1-05 signal, and each is logged. The synthesizer gets the drafts labeled A/B/C, merges them, and notes any disagreement. If fewer than 2 drafts succeed, the single draft stands. It replaces S1 blend everywhere (P2-12).
- Quotas: council counts as 3 messages; agent and research count as an `agentic_task` (until credits arrive in P4-04).

**Tests:** classifier JSON parsing and timeout fallback; mode → tools and budget mapping; private mode never routes to a non-private model and never offers non-private tools (property test over all tools and models); council with 3, 1 and 0 successful drafts.

**Acceptance criteria:** AC1: on a 40-message labeled set, the router picks an acceptable mode for at least 85% of messages (labels in `evals/router/`). AC2: the router adds at most 700 ms p95 latency. AC3: `auto` cost on the bench is at most the Phase 1 cost.

---

## P2-10 Native multimodal messages

**Files:** edit `server/kemma/engine.ts` (`KemmaMessage.content` can be a string or parts), `server/core/llmHttp.ts` (`placeDynamicContext` handles parts), `server/lib/attachments.ts`, `server/routes/kemmaStream.ts`; add `sharp` for downscaling; tests.

**Spec**
- `content: string | Array<{type:"text", text} | {type:"image_url", image_url:{url}}>` (OpenAI-compatible; Gemini compat, Qwen-VL and LiteLLM all accept it).
- Image attachments become image parts when the selected model has `caps.vision`. Otherwise use the existing text description (`describeImageWithVision`).
- Downscale to at most 1568 px on the longest side, re-encode as JPEG at quality 85 (PNG when transparent), with at most 8 images per message.
- Persist image references in the user message `metadata.attachments` (`fileId`, url). History rebuilds image parts for the **latest 2** image messages only; older ones become their text descriptions (stored on first describe).
- Chat no longer calls `kemmaVisionExecute`; it stays for `phone_scan` and documents. Vision usage is logged with real tokens.

**Tests:** part adapters per provider; downscale; history policy (only the latest 2 images as parts); non-vision model gets descriptions; the fallback chain requires vision.

**Acceptance criteria:** "what's wrong in this screenshot" answers with detail the description path misses (3 fixture cases judged in the PR); token usage is logged above 0.

---

## P2-11 Persistent sandbox and file outputs

**Files:** create `server/kemma/sandbox/{manager,files}.ts` and tests; edit `server/kemma/kemmaMax.ts` (`runCode` uses the manager), `server/kemma/toolkit/builtin/code.ts`.

**Spec**
- `getSandbox(userId, sessionId)`: reconnects to the sandbox id stored in `kv_cache` namespace `sbx` (`Sandbox.connect`) or creates a new one (template `E2B_SANDBOX_TEMPLATE`).
  - Extend its timeout on each use (`setTimeout`) up to `SANDBOX_IDLE_MIN` (default 15).
  - Use pause and resume only if the pinned SDK (2.8.0) supports it; **verify** and note the result in the PR.
  - At most 1 sandbox per session and 3 per user; the oldest is killed.
- On the first use in a session, upload `session_files` originals to `/home/user/data/` (P2-01 `storage_key`).
- After each run: list `/home/user/output/` for new or changed files (at most 10 files, 25 MB each) → `storeFile` (storage adapter + `files` row with threadId) → emit a `file` event, and return `{ files: [{ name, url, mime, size }] }`.
  - Rich results from `execution.results` (PNG charts → stored images → `image` event; HTML tables → returned as markdown).
- Languages: `python`, `javascript`, `bash`, `r` (if the template supports them).
- Usage: sandbox seconds logged (`purpose="sandbox"`, cost from `SANDBOX_COST_PER_MIN`).
- Template recommendation in `ops/e2b/README.md`: pandas, numpy, matplotlib, duckdb, openpyxl, python-docx, scikit-learn.

**Tests:** reuse across calls (mocked SDK); output collection; per-user caps; abort kills the running execution; upload of session files.

**Acceptance criteria:** a variable defined in call 1 is readable in call 3 of the same session (mocked and one real run with output shown in the PR); an uploaded CSV can be analyzed and a chart comes back as an image.

---

## P2-12 One engine for every channel and a typed event protocol

**Why:** six paths have different brains (`routers/chat.ts` S1 blend, `routers/intelligence.ts` + `services/blendedAgents.ts`, `routers/s1Router.ts`, `routers/openclawRouter.ts`, `lib/telegramChat.ts`, `services/whatsappBaileys.ts`).

**Files:** create `server/kemma/surfaces/{types,web,telegram,whatsapp,openclaw}.ts`; edit `server/lib/telegramChat.ts`, `server/services/whatsappBaileys.ts`, `server/routers/openclawRouter.ts`, `server/routers/intelligence.ts` (`/chat` only), `server/kemma/events.ts` (complete the union); retire `server/routers/chat.ts` (`/api/chat/stream`; no client calls it, per grep) and `server/services/blendedAgents.ts`. `s1Router` keeps only what the council or prompts still import.

**Spec**
- `runTurn({ userId, channel, conversationKey, text, attachments, mode?, signal }) → AsyncIterable<EngineEvent>`. It handles session lookup or creation (`chat_sessions` keyed by `channel:conversationKey`, so Telegram and WhatsApp chats get history and memory), persistence, memory injection and quotas. Channels only format output:
  - Telegram and WhatsApp: plain text, sources as a short list, images as media, approvals as inline buttons ("Approve" / "Decline" call P1-11 with signed callback data).
  - Web: SSE.
  - openclaw: JSON.
- Event protocol v2 is fully typed (`events.ts`); `kemmaStream` and `research` serialize from it.
- Retired routes return `410 Gone` with a pointer for one release and count hits in the logs. Removing the code is a follow-up WP after 2 weeks with zero hits.
- Telegram `/council`, `/fast`, `/think` and `/private` set the mode for that chat.

**Tests:** each adapter maps events to the right outbound shape; conversation keys map to stable sessions; approval callbacks; retired routes return 410; existing Telegram and WhatsApp audit tests updated and green.

**Acceptance criteria:** the same question on web, Telegram and WhatsApp produces the same tool behavior and memory use (trace comparison in the PR); no remaining imports of `blendedAgents`.

---

## Phase 2 exit criteria

| Metric | Target | Source |
|---|---|---|
| Memory recall / stale-fact rate / duplicate rate | ≥ 85% / ≤ 5% / ≤ 5% | `evals/memory` |
| 200-page file QA accuracy | ≥ 80%, with ≥ 70% fewer input tokens | P2-07 fixture |
| Parsing cost on text-layer PDFs | 0 LLM calls | usage_logs |
| Selectable models (gateway configured) | ≥ 8, tier-gated | UI + test |
| Router mode accuracy / added latency p95 | ≥ 85% / ≤ 700 ms | `evals/router` |
| Sandbox state across calls | persists (3+ sequential calls) | test |
| Chat paths not using `runTurn` | 0 | grep + test |
| CI incl. `db-tests` | green | CI |
