# Sutaeru backend upgrade plan

Date: 2026-10-05. Scope: everything under `server/`, `drizzle/`, `mcp.config.json`, `skills/`, `evals/`.
Goal: make Kemma the most capable and productive agent chat available, with the widest set of options, without losing the safety rules in `PLAN.md` (G1–G4).

How to read this: each feature has **what exists** (with file references), **what's wrong or missing**, **the upgrade**, and **which AI to use** (open-source vs. API). Priorities: **P0** = do first (bugs or big wins for little work), **P1** = the features that set the product apart, **P2** = depth and polish.

> Model and vendor names are current to mid-2026. Check pricing and versions before you wire anything in. The LiteLLM gateway (`litellm/` prefix in `server/core/kemmaRouter.ts`) already lets you add most API models with no new code.

---

## 0. Executive summary: top 12 changes by impact

| # | Change | Why it matters | Effort |
|---|--------|----------------|--------|
| 1 | **Stream every turn, including tool turns** | Any request that offers tools today is non-streamed (`engine.ts:400` `stream: !!onStream && !offerTools`). Since tools are offered on almost every turn, users stare at a spinner and then the whole answer appears at once. | M |
| 2 | **Run tool calls in parallel** | Tools run one after another (`engine.ts:421` `for … await`). Five searches take five times as long as one. | S |
| 3 | **Real cancellation** | When the client disconnects, `kemmaStream.ts` only sets `aborted = true`. The engine keeps calling models and tools and keeps spending money. | S |
| 4 | **Context management** | There's no token counting and no compaction. Full history plus raw tool JSON (up to 10k characters per browse) goes back on every step. Long chats get slow and expensive, then fail. `max_tokens: 4096` is hard-coded and truncated answers aren't continued. | M |
| 5 | **Replace the search and browse back ends** | `web_search` runs a whole Sonar-Pro LLM answer ($3/$15 per 1M tokens) and then throws the answer away to keep the result list. `browse` launches a cloud browser *agent* for every URL, with a 60 s timeout. Both are slow and costly. | M |
| 6 | **pgvector + hybrid retrieval for memory** | `vectorSearch.ts:178` loads every memory a user has and scores cosine similarity in JS on each message. Embeddings sit in a JSON column. | M |
| 7 | **Server-side automatic memory** | Memory extraction only runs when the client calls `/api/fn/memories` `extract`. There's no dedupe, no updating of stale facts, and no forgetting. | M |
| 8 | **Expose existing capabilities as tools** | Gmail (`listEmails`, `sendEmail`), Calendar (`listCalendarEvents`, `createCalendarEvent`), image generation, video generation, monitors and deep research all exist in the backend but the chat agent can't call them. | S–M |
| 9 | **One engine for every channel** | There are 6 or more chat paths: `kemmaStream`, `routers/chat.ts` (S1 blend), `routers/intelligence.ts` + `services/blendedAgents.ts`, `routers/s1Router.ts`, `openclawRouter`, Telegram and WhatsApp. They have different prompts, tools, memory and quotas. | M |
| 10 | **User-facing model picker and modes** | `settings.ts:41` ignores any model the client sends ("The model is chosen by us"). For a "most options" product, let users pick a model, gated by tier. | S |
| 11 | **Cheaper, better file reading** | Every PDF goes whole to a vision LLM (`fnDocument.ts:81`) on every request, with no text-layer extraction and no cache. XLSX, CSV, PPTX, code, HTML and audio attachments aren't supported. | M |
| 12 | **Tracing, evals and cost truth** | Logging is `console.error` only. Vision calls log 0 tokens. There's no per-run trace. Evals cover research only. | M |

---

## 1. Agent engine (`server/kemma/engine.ts`, `server/core/llmHttp.ts`)

### What exists
- An OpenAI-compatible tool loop with a fallback chain (`callChainFor`), spend caps, prompt-cache markers for Qwen, Gemini thought-signature handling, skill narrowing and MCP tools.
- `MAX_STEPS` and `MAX_TOOL_CALLS` per tier.
- Parallel sub-agents (`runParallelSubAgents`), but they only run when `!onStream` (never in the chat UI), and `KEMMA_MAX_SUBAGENTS` defaults to 1, so in practice they're off.

### Problems
1. **No streaming on tool turns** (see summary #1). The fix is to stream always, accumulate `delta.tool_calls[i].function.arguments` fragments by index, and emit text as it arrives.
2. **Sequential tool execution.** Run independent calls with `Promise.allSettled` and a concurrency cap (`p-limit` is already a dependency). Keep the result order stable for the model.
3. **No AbortSignal threading.** Pass `req`'s `AbortController.signal` through `kemmaExecute → callLLM → fetchWithRetry` (which already supports `init.signal`) and into the tool executors.
4. **Hard `max_tokens: 4096`.** Make it per-route and per-mode (8k for chat, 32k or more for reports). On `finish_reason === "length"`, continue automatically.
5. **Unbounded context.** Add:
   - Token estimation per message (tiktoken-compatible estimator, or the provider's `usage` from the previous step).
   - Tool-result shrinking: keep the full output in the DB or trace, send the model a capped summary plus a handle (`result_id`) it can re-read with a `read_result` tool.
   - Rolling compaction: when history exceeds about 60% of the model window, summarize older turns with the cheap model into a pinned "conversation so far" block.
6. **Regex complexity routing** (`detectComplexity`). Words like "all", "every", "design" or "document" flip a request to the report route. Replace it with:
   - an explicit user mode (Fast / Think / Research / Agent / Council), and
   - a tiny classifier call (Gemini Flash-Lite, Qwen-Turbo or Haiku 4.5) costing about $0.0001, *or* an open-source classifier (a fine-tuned ModernBERT, or a small Qwen3-0.6B/1.7B on CPU) that returns `{intent, needs_tools, needs_research, difficulty}`.
7. **Sub-agents never run in chat.** Enable them for Research mode with streaming progress events (`subagent_start`, `subagent_done`). Raise the default to 3–5 and give each sub-agent its own source pool, then cite the merged pool.
8. **No planning or to-do state.** Add a `plan` tool (or a structured first step) that writes a visible checklist the UI renders and the agent updates (`todo_update`). This makes long runs legible and resumable.
9. **No reasoning stream.** Forward `reasoning_content` / thinking deltas as a separate `thinking` SSE event, collapsed in the UI, for models that return it (Qwen3 thinking, DeepSeek-R1, Gemini thoughts, Claude extended thinking).
10. **Background and resumable runs.** Long agent tasks should run as pg-boss jobs (already in `server/core/jobs.ts`) that persist events. The client then re-attaches by `runId` and a closed tab doesn't kill the work. Notify via push, email or Telegram when done.
11. **Human-in-the-loop approvals.** Add a generic `requires_approval` flag per tool (write actions: `sendEmail`, `drive_edit`, calendar create, MCP write tools). The engine pauses, emits `approval_request`, and resumes on `/api/kemma/approve`. This also satisfies G3 in `PLAN.md`.
12. **Structured output mode.** Allow `response_format: json_schema` for document, report and extraction calls instead of regex JSON-fence stripping (`engine.ts` planner, `documentPipeline` `extractJson`).

### Which AI
| Slot | API (best quality) | Open source (self-host via vLLM or SGLang, or a hosted OSS API like Together, Fireworks, Groq or DeepInfra) |
|---|---|---|
| Main agent / tool use | Claude Sonnet 5.5 or Opus 5.5 (strongest tool use and long agent runs), GPT-5-class, Gemini 3.x Pro | Qwen3 (235B-A22B / Max-class) ✔ already used, Kimi K2 (agentic tool use), GLM-4.5/4.6, DeepSeek V3.x, gpt-oss-120b |
| Fast router / classifier | Claude Haiku 4.5, Gemini Flash-Lite, Qwen-Turbo | Qwen3-1.7B/4B, Llama 3.2 3B, ModernBERT fine-tune |
| Reasoning ("Think") | Claude Opus 5.5 with extended thinking, Gemini 3.x Pro, o-series/GPT-5 thinking | DeepSeek-R1 line, Qwen3 thinking mode, QwQ |
| Summarize / compaction | Haiku 4.5, Gemini Flash | Qwen3-8B/14B, Llama 3.1 8B |

**Action:** re-enable Anthropic and OpenAI through the LiteLLM gateway (`litellm/claude-sonnet-5-5`, `litellm/gpt-…`). The comment at the top of `kemmaRouter.ts` says they were dropped, but the gateway already supports them, so you only need to add rows to the price table and a picker entry.

---

## 2. Model router and options (`server/core/kemmaRouter.ts`, `server/kemma/settings.ts`)

### Problems
- The user can't choose a model, so there's no "most options".
- The picker list in `listAvailableModels` is hand-coded and includes env-slot names ("Planner", "Verify") that mean nothing to users.
- The fallback chain is fixed (chat → vision → fallback). It isn't capability-aware: a tool call could fall back to a model without tool support, and an image could fall back to a text-only model.
- `ROUGH_PRICES_USD_PER_1M` is a hand-kept table with an unknown-model default of $2/$6.
- `trial` and `pro` quotas are identical (`QUOTA_LIMITS`).

### Upgrade
1. **Model registry** (DB table `models`, or a JSON config): id, provider, label, context window, max output, capabilities `{tools, vision, audio, json_schema, reasoning, cache}`, prices, tier gate, enabled. The router, picker, cost estimate and fallback all read from it.
2. **Capability-aware fallback.** Only fall back to models that have the capabilities the request needs.
3. **User modes**, exposed in the API:
   - **Auto** (router picks)
   - **Fast** (cheap model, light tools)
   - **Think** (reasoning model)
   - **Research** (multi-agent + citations)
   - **Agent** (all tools, long budget, background run)
   - **Council**: today's S1 "blend" made *opt-in*. Several models answer, then one synthesis pass, or a judge picks the best answer.
   - **Private**: open-source model on your own GPU or Venice, with no third-party logging.
4. **Per-user BYOK (bring your own key)**: the `hasByos` field exists in `EngineInput` but isn't implemented. Store encrypted keys per user (reuse the `GOOGLE_TOKEN_ENCRYPTION_KEY` pattern) and route their requests through them without counting against your spend cap.
5. **Pull prices from the gateway** (LiteLLM's model cost map) instead of the hand table.
6. **Semantic response cache** for identical or near-identical non-personal prompts (embedding similarity of 0.97 or higher), with a short TTL.

---

## 3. Web search and browsing (`server/kemma/executors/webSearch.ts`, `kemmaMax.ts` `browse`)

### Problems
- Search runs a full Sonar-Pro chat completion and parses `search_results`. You pay for an answer that gets discarded, and latency is several seconds.
- The search cache is in-process memory, so it's lost on restart and not shared across instances.
- `browse` calls the browser-use cloud *agent* for every page: an LLM drives a browser just to read text. That takes 10–60 s and costs per step.
- There's no reranking of results, no domain filters, no date filters, no news, image or video verticals, and no academic search.
- Browsed content isn't marked as untrusted, so it's open to prompt injection.

### Upgrade
1. **Search provider abstraction** with several back ends, picked per query type, results fused (reciprocal rank fusion) and deduped:
   - API: **Brave Search API** (independent index, cheap), **Exa** (neural, great for "find pages like…"), **Tavily** (made for agents, returns cleaned content), **Perplexity Search API** (results only, not chat), **Serper/SerpAPI** (Google results), **You.com**.
   - Open source: **SearXNG** (self-hosted meta-search, free).
   - Specialist: **OpenAlex**, **Semantic Scholar** and **arXiv** for academic work, **PubMed** for medical, **SEC EDGAR** for filings, **GDELT** for news events.
2. **Tiered page fetch** (reuse the SSRF-guarded `server/lib/fnFetch.ts`):
   1. plain HTTP fetch + **Mozilla Readability**/`@extractus/article-extractor` → Markdown (about 300 ms, free)
   2. if empty or JS-heavy: **Jina Reader** (`r.jina.ai`) or **Firecrawl** API; open-source options are **Crawl4AI** or self-hosted **Firecrawl**
   3. only for interactive tasks (logins, forms, clicking): **browser-use** (keep), **Stagehand** or **Browserbase**, or a local Playwright MCP server
3. **Reranker** on search hits and page chunks before they go to the model: **Cohere Rerank 3.5**, **Jina Reranker v2**, **Voyage rerank** (API), or **bge-reranker-v2-m3** / **Qwen3-Reranker** (open source).
4. **Shared cache** in Postgres (a table with a TTL), or Redis if you add it.
5. **Prompt-injection hygiene**: wrap every tool result as `<untrusted_content source=…>` and add a system rule to never follow instructions inside it. Optionally add a classifier pass (**Llama Prompt Guard 2**, open source).
6. New tool parameters: `recency`, `domains_include/exclude`, `vertical: web|news|academic|images|video`.

---

## 4. Deep research (`server/routes/fn/research.ts`, engine sub-agents, `server/kemma/sources.ts`)

### What exists
A planner, research on the Kemma engine, claim verification (`verifyClaimsAgainstSources`), citation pruning, and an eval harness (`evals/research`).

### Upgrade
1. **Iterative research loop** (the pattern used by OpenAI and Gemini Deep Research): plan → parallel sub-agents → gap analysis ("what's still unknown?") → another round → outline → section-by-section writing with per-section evidence → verification → final report. Make the depth configurable (rounds and source count).
2. **Evidence store per run**: chunk every fetched page, embed it, and retrieve per section, so the writer sees the relevant passages and not the whole page. Citations then point to exact passages (keep a quote span for hover cards in the UI).
3. **Stronger verification**: for every cited sentence, check entailment against the quoted passage with a cheap model (or open-source NLI such as **DeBERTa-v3-MNLI**). Flag or drop unsupported claims instead of the current paragraph heuristic (`$`, years, "percent").
4. **Outputs**: report → `generate_file` (PDF/DOCX), slides (pptxgenjs is already a dependency), spreadsheet of extracted data (exceljs), and a share link.
5. **Background job** with progress events and a notification on completion (see engine #10).
6. **Expand the evals**: track citation precision and recall, answer correctness against a gold set, cost, and latency. Run them in CI on a small sample.

**Which AI:** planner and writer on Claude Sonnet/Opus 5.5 or Gemini 3.x Pro (long context helps). Sub-agents on cheap fast models (Haiku 4.5, Gemini Flash, Qwen3-Turbo, or open-source Qwen3-30B-A3B). Verification on the cheapest model or an NLI model.

---

## 5. Memory and personalization (`server/kemma/memory.ts`, `services/vectorSearch.ts`, `routes/fn/memories.ts`)

### Problems
- A full-table scan with in-JS cosine similarity on every message. Embeddings live in `structuredData` JSON, and a process-local `vectorStore` Map duplicates them.
- Extraction is triggered by the client and only proposes memories. There's no merge or update logic, so duplicates and contradictions pile up.
- Memories go only to the latest user message (good for caching), but there's no "core profile" that's always present.
- Chat history itself (past threads) isn't searchable by the agent.

### Upgrade
1. **pgvector** (`CREATE EXTENSION vector`) with an HNSW index on `memories.embedding vector(768/1024)`, plus a `tsvector` column for BM25. Use **hybrid search** (vector + keyword, fused) and then rerank.
2. **Automatic extraction job** after each assistant turn (pg-boss, async, cheap model). Use a Mem0-style operation set: `ADD | UPDATE | DELETE | NOOP` against the top-k similar existing memories. Keep the "living memory" opt-out setting that already exists.
3. **Memory tiers**: core profile (always injected, under 500 tokens), episodic (retrieved), and project/space memory (scoped to `spaces`).
4. **Agent tools**: `memory_search`, `memory_save` and `conversation_search` (over past `chat_messages`, embedded the same way).
5. **Transparency**: every injected memory is listed in the SSE `memories_used` event, and the user can correct it in place.

**Which AI:**
- Embeddings via API: **Gemini Embedding** (current), **OpenAI text-embedding-3-large**, **Voyage-3**, **Cohere Embed v4**.
- Embeddings, open source: **BGE-M3** (multilingual, dense and sparse), **Qwen3-Embedding**, **nomic-embed-text-v2**, **jina-embeddings-v3**. These run on CPU via `text-embeddings-inference`.
- Frameworks to borrow ideas from or plug in: **Mem0**, **Zep/Graphiti** (temporal knowledge graph), **Letta**.

---

## 6. Files, documents and attachments (`lib/attachments.ts`, `lib/fnDocument.ts`, `executors/safeFiles.ts`, `fileGenerator.ts`, `lib/documentPipeline.ts`)

### Problems
- Every PDF goes whole to the vision model on every request: slow, costly and size-limited. Nothing is cached.
- Only PDF, DOCX, MD, TXT and images are accepted. There's no XLSX, CSV, PPTX, HTML, EPUB, code, ZIP or audio/video.
- The 20k-character cap per file and 60k total means big documents are silently cut, not retrieved.
- `generate_file` covers pdf/docx/xlsx/csv/txt/json/html/md but not PPTX (pptxgenjs is installed but not exposed as a format), and there's no charts-in-documents path.

### Upgrade
1. **Parsing pipeline**: text layer first (`pdfjs-dist` / `unpdf`), then fall back to OCR only for pages with no text. Cache parsed output by SHA-256 in storage.
   - Open source: **Docling** (IBM; tables, layout, very good), **Marker**, **MinerU**, **Unstructured**. Tesseract or **PaddleOCR** for OCR.
   - API: **Mistral OCR**, **LlamaParse**, **Reducto**, Gemini or Claude PDF input for hard scanned docs.
2. **Chunk + embed + retrieve** large files (the same pgvector store, scoped to the thread or space) instead of truncating. Add a "Chat with this folder or Drive" option.
3. **New formats**: XLSX/CSV (exceljs → Markdown table, plus load into the sandbox for analysis), PPTX (unzip XML), HTML (Readability), code files (as-is), audio/video (transcribe, see §8).
4. **Generation**: add `pptx` to `generate_file`, chart images through the sandbox (matplotlib) embedded in DOCX/PDF, and templates (`skills/*.md` already has investor-summary, market-brief and others; turn them into generate templates).
5. **Documents pipeline** (`documentPipeline.ts`) is already solid (planning → research → writing → checking). Add section-level evidence retrieval (§4.2) and a "revise this section" endpoint for iterative editing.

---

## 7. Code execution and data analysis (`kemmaMax.ts` `runCode`, E2B)

### Problems
- A new sandbox per call that's killed right after, so variables, installed packages and uploaded files are lost between steps. Multi-step data analysis fails or wastes calls.
- Generated files (charts, CSVs) from `run_code` aren't returned to the user (only `runSkillScript` lists `/output`).
- No access to the user's attachments inside the sandbox.

### Upgrade
1. **Per-thread persistent sandbox** keyed by `sessionId`, with an idle timeout (E2B supports pause/resume and reconnecting by id).
2. **Mount attachments** at `/data` automatically. Collect anything written to `/output` → storage → return as file cards and image previews (charts) in SSE.
3. **Rich results**: return E2B `results` (PNG charts, HTML tables) and not just stdout.
4. More languages: R, Bash, SQL (DuckDB over uploaded CSV/XLSX).

**Which:** E2B (keep), **Daytona** or **Modal** sandboxes (API), or open-source **Firecracker / gVisor + Jupyter kernel gateway** if you want to self-host.

---

## 8. Voice (`lib/fnVoice.ts`, `routes/fn/voice.ts`, `services/elevenlabs.ts`)

### What exists
ElevenLabs STT (`speech-to-text`) and TTS as request/response calls, and an ElevenLabs conversational agent prompt builder.

### Upgrade
1. **Realtime duplex voice** over WebSocket/WebRTC with barge-in, using the same engine and tools (not a separate ElevenLabs agent with its own brain).
   - Framework (open source): **LiveKit Agents** or **Pipecat**: STT → Kemma engine (streaming) → TTS, with voice-activity detection (**Silero VAD**) and turn detection.
   - Speech-to-speech APIs, for the lowest latency: **OpenAI Realtime**, **Gemini Live**.
2. **STT**: API options are **Deepgram Nova-3** (streaming, cheap), **ElevenLabs Scribe**, **AssemblyAI**. Open source: **Whisper large-v3-turbo** via `faster-whisper`, **NVIDIA Parakeet**.
3. **TTS**: API options are **ElevenLabs Flash/v3** (keep), **Cartesia Sonic**, **OpenAI TTS**. Open source: **Kokoro-82M** (tiny, good quality), **Orpheus**, **Sesame CSM**, **XTTS-v2** (voice cloning, check the license).
4. **Meeting and recording mode**: upload or record → transcribe with speaker labels (pyannote, open source, or Deepgram/AssemblyAI) → summary, action items and memories.

---

## 9. Image and video generation (`lib/fnImage.ts`, `lib/fnVideo.ts`, `lib/chatImage.ts`)

### What exists
Strong groundwork: multi-engine image (Gemini, Wan/Qwen, gpt-image via gateway, Forge GPU, Venice), multi-engine video (Sora, Veo, Wan, open-source on GPU) as pg-boss jobs, reference images, rate limits.

### Problems
- The chat agent can't call image or video generation as a tool (Telegram and WhatsApp `/image` commands only). The chat "image" mode maps to `generate_file`.
- No editing loop (inpaint, "make the sky darker") as a chat follow-up on the last image.

### Upgrade
1. Add `generate_image`, `edit_image` and `generate_video` tools that call the existing engines. Video returns a job id and the UI polls or gets pushed the result.
2. **Image editing**: **Gemini 2.5 Flash Image** ("nano-banana") or **gpt-image-1** edits via API. Open source: **FLUX.1 Kontext [dev]** and **Qwen-Image-Edit** on the Forge GPU.
3. **More engines**: API options are **Imagen 4**, **Ideogram 3** (text in images), **Recraft v3** (vector/brand), **Midjourney** (no official API), and **fal.ai** or **Replicate** as one-key aggregators. Open source: **FLUX.1 [dev/schnell]**, **Qwen-Image**, **HiDream-I1**, **SDXL** (keep Realistic Vision).
4. **Video**: API options are **Veo 3** (with audio), **Sora 2**, **Kling**, **Runway Gen-4**, **Luma Ray**. Open source: **Wan 2.2**, **LTX-Video**, **HunyuanVideo**.
5. Utilities as tools: background removal (**BiRefNet / RMBG-2.0**, open source), upscaling (**Real-ESRGAN**), image-to-text captioning (the vision model you already have).

---

## 10. Vision and multimodal chat (`kemmaVisionExecute`, `kemmaDocumentScan`)

### Problems
- Vision is a separate one-shot path: one image, no tools, no history, no memory injection beyond the system prompt, and `inputTokens: 0` is logged.
- Images in normal chat become a *text description* (`describeImageWithVision`) before the main model sees them, so detail is lost.

### Upgrade
- Send image parts natively in the engine's message array when the chosen model supports vision (registry capability). Fall back to the description only for text-only models.
- Multi-image and video-frame input. Screenshot-to-code. Chart or table reading into a spreadsheet.
- **Which:** Gemini 3.x Flash/Pro (best price for vision), Claude Sonnet 5.5 (documents and screenshots), **Qwen2.5-VL / Qwen3-VL** (open source, strong OCR), **InternVL3**, **Llama 4** multimodal.

---

## 11. Integrations, connectors and MCP (`kemma/mcp/*`, `mcp.config.json`, `services/google.ts`, Telegram, WhatsApp)

### Problems
- MCP uses static bearer tokens from env (server-wide), and every connector is disabled. Most URLs are placeholders. Tools are read-only allowlists. There's no per-user OAuth.
- Google: Gmail and Calendar functions exist (`services/google.ts:191–340`) but aren't agent tools.
- Agent-facing Drive scope is confined to a root folder (good, G2).

### Upgrade
1. **Per-user MCP connections** with the MCP OAuth 2.1 flow (the `@modelcontextprotocol/sdk` client supports it). Tokens are stored encrypted per user, so each user connects their own Notion, Figma, Canva, Dropbox, Zapier and so on.
2. **Write tools behind approval** (engine #11). Classify every tool as `read | write | destructive`. Destructive tools stay blocked (G1).
3. **New built-in tools**: `gmail_search`, `gmail_read`, `gmail_draft` (send needs approval), `calendar_list`, `calendar_create` (approval), `drive_*` (exists), `create_monitor` / `schedule_task` (reuse monitors + pg-boss), `deep_research`, `generate_image/video`, `maps/places`, `finance_quote` (enable the Twelve Data MCP), `weather`.
4. **Remote MCP server *of Kemma itself***: expose Kemma's memory, files and research as an MCP server so users can use Sutaeru from Claude Desktop, Cursor and others.
5. **Channels**: Telegram and WhatsApp should go through the same engine (§12) with the same tools, memory and approvals (approve via inline buttons). Add Slack and Discord bots, email-in ("forward to kemma@…"), and a browser extension.

---

## 12. Consolidate the chat surfaces (architecture)

There are overlapping, divergent paths today:
- `POST /api/kemma/stream` → `kemmaExecute` (main)
- `routers/chat.ts` (S1 blend: Qwen + Gemini + Sonar in parallel, then synthesis, which is 3–4× the cost on every message)
- `routers/intelligence.ts` + `services/blendedAgents.ts`
- `routers/s1Router.ts`
- `routers/openclawRouter.ts`, `lib/telegramChat.ts`, `services/whatsappBaileys.ts`

**Plan:** make `kemmaExecute` the single brain. Every surface becomes a thin adapter (input normalization → engine → output formatting). The blend becomes the opt-in **Council** mode (§2.3). Delete or retire the duplicate routers once each client is moved, which also shrinks the test surface (there are many `*.audit.test.ts` files per path).

Adopt a **single event protocol** for all streams (`token`, `thinking`, `tool_start`, `tool_end`, `plan`, `approval_request`, `sources`, `file`, `image`, `usage`, `done`, `error`), versioned, ideally compatible with the Vercel AI SDK UI stream (the `ai` package is already a dependency).

---

## 13. Skills and custom agents (`kemma/fileSkills.ts`, `skillReviews.ts`, `routers/agents.ts`, `skills/`)

- File skills with hash-approved review are a good base (Claude-skill style `SKILL.md`, `load_skill`, scripts in E2B).
- **Upgrade**:
  - User-created skills and **custom agents** (system prompt, tool allowlist, model, knowledge files) shareable via link. This is the "GPTs/Gems" equivalent.
  - **Skill marketplace** with ratings (`skill_ratings` table exists).
  - Auto-suggest a skill when a request matches its description (embedding match).
  - Ship more first-party skills: SWOT, pitch deck, contract review, SEO audit, financial model, meeting minutes, email triage, travel plan.

---

## 14. Safety, privacy and abuse

- Keep G1–G4 from `PLAN.md`.
- Treat all tool output as untrusted (§3.5). Add a guard model on browsed and uploaded content before it reaches a tool-calling turn: **Llama Guard 4**, **Llama Prompt Guard 2**, **ShieldGemma** (open source), or provider moderation APIs.
- `lib/sensitive.ts` routing: keep it, but log decisions to `audit_logs`.
- PII redaction option for "Private" mode (**Microsoft Presidio**, open source).
- `detectDangerousCode` is regex-only, which is fine since E2B is the real boundary. Keep the sandbox network egress allowlist strict.

---

## 15. Observability, cost and quality

1. **Tracing**: **Langfuse** (open source, self-hostable) or **OpenTelemetry** → Grafana/Tempo. Record one trace per run with spans per LLM call and tool, tokens, cost, model, and fallbacks used. **Helicone** is an alternative if you route through a proxy.
2. **Cost truth**: log real usage for vision, image and video (currently 0 or estimated). Track per-user and per-feature cost dashboards from `usage_logs`.
3. **Evals in CI**: extend `evals/` with tool-use, memory recall, document quality and regression suites. Tools: **promptfoo** (open source), **Ragas** (retrieval), and an LLM-as-judge on Sonnet/Opus 5.5.
4. **Structured logging**: `pino` is a dependency but `console.*` is used throughout. Switch, with a request id and run id on every line.
5. **Feedback loop**: thumbs up or down plus an optional reason per answer, stored with the trace id. Use it for router tuning and eval set growth.

---

## 16. Platform and data layer

- **pgvector** extension and migrations (§5, §6). The Drizzle migrations have gaps (0005 → 0008 → 0010) to check.
- **Redis** (or Postgres-only alternatives) for the shared search cache, rate limits and stream fan-out across instances. Today several caches are process-local Maps (search cache, vector cache, Drive folder cache).
- **Resumable streams**: persist run events so `GET /api/runs/:id/events?after=N` can replay after a reconnect.
- **Quotas**: make tiers meaningfully different (trial = pro today). Meter by cost (credits) rather than message count, so expensive modes (Research, Council, video) are fairly priced.
- **Typecheck and tests**: `node_modules` isn't installed in this container, so `npm run check` and `npm test` weren't run for this review. Run them before starting.

---

## 17. Phased roadmap

### Phase 1: fix the fundamentals (1–2 weeks)
- [ ] Stream tool turns and accumulate tool-call deltas (§1.1)
- [ ] Parallel tool execution (§1.2)
- [ ] AbortSignal end-to-end (§1.3)
- [ ] Per-route `max_tokens`, auto-continue on length (§1.4)
- [ ] Tool-result capping + `result_id` re-read (§1.5)
- [ ] Search: swap Sonar chat for a results-only API (Brave, Tavily or Exa) + reranker (§3.1, §3.3)
- [ ] Browse: fetch + Readability → Jina/Firecrawl → browser-use tiers (§3.2)
- [ ] Mark tool outputs as untrusted (§3.5)
- [ ] Expose Gmail, Calendar, image, video, monitors as tools, with approval for writes (§11.3, §1.11)

### Phase 2: memory, files, options (2–4 weeks)
- [ ] pgvector + hybrid search + automatic memory extraction with ADD/UPDATE/DELETE (§5)
- [ ] Document parsing pipeline (Docling, text layer first, cache) + chunked retrieval (§6)
- [ ] Model registry + user model picker + modes, including opt-in Council (§2)
- [ ] Native multimodal messages in the engine (§10)
- [ ] Persistent per-thread sandbox + file outputs (§7)
- [ ] Unify chat surfaces onto the engine (§12)

### Phase 3: what sets it apart (4–8 weeks)
- [ ] Iterative deep research with an evidence store and entailment verification (§4)
- [ ] Background and resumable agent runs + notifications (§1.10, §16)
- [ ] Visible plan/to-do in long runs (§1.8)
- [ ] Realtime voice with LiveKit or Pipecat on the same engine (§8)
- [ ] Per-user MCP OAuth connectors + Kemma as an MCP server (§11)
- [ ] Custom agents and a skill marketplace (§13)
- [ ] BYOK (§2.4)

### Phase 4: quality engine (ongoing)
- [ ] Langfuse tracing, cost dashboards, CI evals, feedback-driven router tuning (§15)
- [ ] Guard models, PII redaction for Private mode (§14)

---

## 18. Quick reference: recommended stack

| Need | Best API | Best open source |
|---|---|---|
| Main agent LLM | Claude Sonnet 5.5 / Opus 5.5, GPT-5-class, Gemini 3.x Pro | Qwen3 Max-class / 235B, Kimi K2, GLM-4.6, DeepSeek V3.x, gpt-oss-120b |
| Cheap / fast LLM | Claude Haiku 4.5, Gemini Flash(-Lite) | Qwen3-30B-A3B, Qwen3-8B, Llama 3.1 8B |
| Reasoning | Opus 5.5 extended thinking, Gemini Pro, GPT-5 thinking | DeepSeek-R1 line, Qwen3 thinking |
| LLM serving | LiteLLM gateway (have), OpenRouter | vLLM, SGLang, Ollama |
| Web search | Brave, Exa, Tavily, Perplexity Search API | SearXNG |
| Page reading | Jina Reader, Firecrawl | Readability, Crawl4AI, Firecrawl (self-host) |
| Browser agent | browser-use cloud (have), Browserbase | browser-use, Stagehand, Playwright MCP |
| Embeddings | Gemini Embedding, Voyage-3, OpenAI 3-large, Cohere v4 | BGE-M3, Qwen3-Embedding, nomic v2 |
| Reranking | Cohere Rerank 3.5, Voyage, Jina | bge-reranker-v2-m3, Qwen3-Reranker |
| Vector DB | (Postgres) | pgvector (recommended), Qdrant |
| Memory | Mem0 / Zep cloud | Mem0, Graphiti, Letta |
| Doc parsing / OCR | Mistral OCR, LlamaParse, Reducto | Docling, Marker, MinerU, PaddleOCR |
| Vision | Gemini 3.x, Claude Sonnet 5.5 | Qwen2.5/3-VL, InternVL3 |
| Code sandbox | E2B (have), Daytona, Modal | Jupyter kernel in gVisor/Firecracker |
| STT | Deepgram Nova-3, ElevenLabs Scribe | faster-whisper (large-v3-turbo), Parakeet |
| TTS | ElevenLabs (have), Cartesia | Kokoro, Orpheus, Sesame CSM |
| Realtime voice | OpenAI Realtime, Gemini Live | LiveKit Agents, Pipecat, Silero VAD |
| Image gen / edit | gpt-image-1, Imagen 4, Gemini Flash Image, Ideogram, Recraft | FLUX.1 dev/Kontext, Qwen-Image(-Edit), HiDream |
| Video gen | Veo 3, Sora 2, Kling, Runway | Wan 2.2, LTX-Video, HunyuanVideo |
| Safety | Provider moderation | Llama Guard 4, Prompt Guard 2, ShieldGemma, Presidio |
| Tracing / evals | Helicone, Braintrust | Langfuse, OpenTelemetry, promptfoo, Ragas |
