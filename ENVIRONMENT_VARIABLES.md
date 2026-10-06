# Sutaeru Environment Variables Documentation

> Project: Sutaeru
> Domain: https://sutaeru.com

---

## 📋 Quick Reference

| Category | Count |
|----------|-------|
| Core Application | 5 |
| Database | 1 |
| AI/LLM APIs | 3 |
| Voice/Speech | 3 |
| Storage & Drive | 5 |
| Auth & Login | 2 |
| **Total** | **19** |

---

## 🔧 Core Application Variables

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | Application environment mode (`production` or `development`) |
| `PORT` | Internal app port |
| `APP_URL` | Production URL |
| `VITE_APP_ID` | App identifier for Vite |
| `SESSION_SECRET` | Session/cookie signing key. Falls back to `JWT_SECRET` if unset. The server refuses to start in production without one of the two |
| `ALLOWED_ORIGINS` | Comma-separated list of origins allowed to make credentialed cross-origin requests (CORS). Falls back to `APP_URL`, then `https://sutaeru.com` |

---

## 🗄️ Database

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |

---

## 🤖 AI / LLM API Keys

### Qwen (OpenAI-compatible)
```
QWEN_API_KEY=
QWEN_BASE_URL=https://token-plan.maas.qwencloudapi.com/compatible-mode/v1
```

### Google / Gemini
```
GEMINI_API_KEY=
```

### Perplexity Sonar (web search)
```
SONAR_API_KEY=
```

### P1-08 search provider layer (only used when `FF_SEARCH_V2` is on)

| Variable | Description |
|----------|-------------|
| `BRAVE_SEARCH_API_KEY` | Brave Search API key |
| `TAVILY_API_KEY` | Tavily Search API key |
| `EXA_API_KEY` | Exa Search API key |
| `SEARXNG_URL` | Base URL of a self-hosted SearXNG instance (no trailing slash), e.g. a private one; most public instances disable the JSON API |
| `KEMMA_SEARCH_PROVIDERS` | Comma-separated fast-path provider order, filtered to whichever are configured (default `brave,tavily,sonar`). The `perplexity` id is the results-only Perplexity Search API, reusing `PERPLEXITY_API_KEY`/`SONAR_API_KEY` above — a different endpoint from the Sonar chat-completions path the `sonar` id wraps |
| `SEARCH_COST_<ID>` | Per-request cost override (USD) for provider `<ID>` in upper case, e.g. `SEARCH_COST_BRAVE=0.004`. Falls back to a built-in estimate per provider |
| `KEMMA_SEARCH_RPM_<ID>` | Per-provider requests-per-minute override, e.g. `KEMMA_SEARCH_RPM_BRAVE=20`. Falls back to `KEMMA_SEARCH_RPM` |

### LiteLLM gateway (KoboiLLM)

OpenAI-compatible gateway available as a fourth provider. Calls go to `{LITELLM_BASE_URL}/chat/completions` with `Authorization: Bearer <key>`.

| Variable | Default | Description |
|----------|---------|-------------|
| `LITELLM_BASE_URL` | `https://api.koboillm.com/v1` | Gateway endpoint; trailing slash trimmed |
| `LITELLM_API_KEY` | empty | Gateway key; falls back to `KOBOILLM_API_KEY` |
| `KOBOILLM_API_KEY` | empty | Fallback gateway key |
| `KEMMA_MODEL_FALLBACK` | empty | Optional model id appended as the LAST fallback after `KEMMA_MODEL_CHAT` and `KEMMA_MODEL_VISION`; duplicates are skipped; may use the `litellm/` prefix |

Prefix rule: a model id that starts with `litellm/` (case-insensitive) routes to this gateway, checked before every other routing rule. The prefix is stripped before the request, so `KEMMA_MODEL_PLANNER=litellm/deepseek-ai/deepseek-v3.2-maas` sends model `deepseek-ai/deepseek-v3.2-maas` to the gateway.

---

## 🔊 Voice & Speech (ElevenLabs)

| Variable | Description |
|----------|-------------|
| `ELEVEN_LABS_API_KEY` | Text-to-Speech API |
| `ELEVEN_LABS_AGENT_ID` | Conversational AI Agent |
| `ELEVEN_LABS_VOICE_ID` | Voice preset |

Voice colour knobs for Kemma's spoken persona (all optional; unset or unparsable
values use the defaults below, which are tuned for a warm, close speaking tone).
`server/lib/fnVoice.ts` reads them and shares them between text-to-speech and the
conversational-agent session:

| Variable | Default | Description |
|----------|---------|-------------|
| `ELEVEN_LABS_TTS_MODEL_ID` | `eleven_multilingual_v2` | Model id for the `/api/fn/voice` speak direction |
| `ELEVEN_LABS_AGENT_TTS_MODEL_ID` | `eleven_turbo_v2_5` | Model id for the Conversational AI agent (`ELEVEN_LABS_AGENT_ID`) sessions |
| `ELEVEN_LABS_VOICE_STABILITY` | `0.35` | 0-1; lower is more expressive. The warm persona uses a lower default than ElevenLabs' mid point |
| `ELEVEN_LABS_VOICE_SIMILARITY_BOOST` | `0.75` | 0-1; how strongly the output holds to the cloned voice |
| `ELEVEN_LABS_VOICE_STYLE` | `0.4` | 0-1; extra style-exaggeration. Higher costs more credits and can distort |
| `ELEVEN_LABS_VOICE_SPEAKER_BOOST` | on | Set `0`/`false`/`off`/`no` to turn off speaker enhancement |
| `ELEVEN_LABS_VOICE_SPEED` | `0.95` | 0.5-2 speaking rate for agent calls; slightly under 1 reads as calm |

---

## Vertex AI backend (Gemini)

Gemini can run either through the AI Studio API (static key) or Google Cloud Vertex AI
(service account). Google Cloud trial credits apply to Vertex only.

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_BACKEND` | `aistudio` | `aistudio` or `vertex`. Anything else falls back to `aistudio`. `vertex` also requires `GOOGLE_APPLICATION_CREDENTIALS` to point at a readable service-account JSON; if missing or unreadable, one warning is logged (env var name only, never the path or token) and the AI Studio backend is used |
| `GOOGLE_APPLICATION_CREDENTIALS` | empty | Path to the service-account JSON used for Vertex auth (scope `cloud-platform`). The library caches and refreshes tokens |
| `VERTEX_PROJECT` | empty | GCP project id. Optional: resolved from the service account when unset |
| `VERTEX_LOCATION` | `global` | Location for chat and `generateContent` (vision/documents). The 3.x Gemini models exist only in `global`; `gemini-2.5-*` also work in `us-central1` |
| `VERTEX_EMBEDDING_LOCATION` | `us-central1` | Location for embedding `predict` calls. `text-embedding-004` is not served from `global` |

In Vertex mode:

- OpenAI-compatible chat/tool calls go to `https://aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/endpoints/openapi/chat/completions` with `Authorization: Bearer <token>` and the model sent as `google/<model>`.
- Vision and document scans go to the native `:generateContent` endpoint (standard Gemini body with `inlineData` parts).
- Embeddings use native predict only: `https://us-central1-aiplatform.googleapis.com/v1/projects/{project}/locations/us-central1/publishers/google/models/text-embedding-004:predict`. In Vertex mode any `KEMMA_MODEL_EMBEDDING` other than `text-embedding-004` (including `gemini-embedding-2`) is mapped to `text-embedding-004` with a one-time log; results are always 768-dimensional. `gemini-embedding-2` and the OpenAI-compatible embeddings endpoint do not work on this project; do not use them in Vertex mode.

`gemini-3.1-pro-preview` (slot `KEMMA_MODEL_PRO`, default) and `gemini-2.5-pro`
(slot `KEMMA_MODEL_PRO_FALLBACK`, default, tried when the pro call fails) follow the same
rules: 3.x requires `VERTEX_LOCATION=global`. There is no `gemini-3.8-pro` on Vertex.

---

## 📁 Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_DRIVER` | `local` | Storage backend: `local`, `forge`, or `drive` |
| `STORAGE_LOCAL_ROOT` | `/root/sr1-data/files` | Local filesystem storage path |
| `STORAGE_LOCAL_URL` | `/files` | Public URL path for local files |
| `DRIVE_ROOT_FOLDER_ID` | — | Google Drive root folder id |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | — | Key for encrypting stored Google tokens |

---

## 🔐 Auth & Login

| Variable | Description |
|----------|-------------|
| `ALLOWED_LOGIN` | Comma-separated allowed emails/handles (empty = no logins) |
| `SEED_TEST_PASSWORD` | Bootstrap password for the first account |

---

## 📧 Email

| Variable | Description |
|----------|-------------|
| `EMAIL_HOST` | SMTP host |
| `EMAIL_PORT` | SMTP port |
| `EMAIL_USER` | SMTP username |
| `EMAIL_PASSWORD` | SMTP password |
| `EMAIL_FROM` | From address |

---

## 💳 Stripe

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret |

---

## ☁️ AWS S3 (optional file storage)

| Variable | Description |
|----------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `AWS_REGION` | AWS region |
| `AWS_S3_BUCKET` | S3 bucket name |

---

## 🔑 Google OAuth

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client id |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

---

## ✈️ Telegram

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `TELEGRAM_ALLOWED_USER_IDS` | Comma-separated numeric Telegram user ids allowed to talk to the bot. Empty means nobody: everyone is ignored |
| `TELEGRAM_WEBHOOK_SECRET` | Secret Telegram sends in `X-Telegram-Bot-Api-Secret-Token`; must match the `secret_token` given to `setWebhook` |

---

## 🆕 Kemma Model Routing

| Variable | Default | Description |
|----------|---------|-------------|
| `KEMMA_MODEL_CHAT` | `qwen3.8-max` | Everyday chat, tools, code, file generation |
| `KEMMA_MODEL_SEARCH` | `sonar-pro` | Web search model |
| `KEMMA_MODEL_VISION` | `gemini-3.8-flash` | Vision and documents |
| `KEMMA_UNLIMITED_USER_IDS` | empty | Comma separated user ids that skip quota checks. Use for the owner account and eval runs |
| `SKILLS_DIR` | `./skills` | Folder of agent skills (SKILL.md folders or flat .md). A skill is used only after it is reviewed and switched on for its exact content |
| `MCP_CONFIG` | `./mcp.config.json` | MCP servers and their tool allowlists. Credentials come from env var names listed there, never from the file |
| `JOBS_ENABLED` | on | Set `false` to turn off the pg-boss job runner |
| `JOBS_TICK_SECRET` | empty | Enables `POST /api/jobs/tick` (header `x-jobs-secret`) for Cloud Run with Cloud Scheduler. Empty disables the endpoint |
| `EVAL_USER_ID` | `199` | User id the research eval runs as. The chat bench (`npm run bench`) runs as this user too, but has no default: it refuses to start unless this or `--user <id>` is given |
| `EVAL_DB_HOST` | empty | Replaces the host in `DATABASE_URL` when the eval or the bench runs on the VPS host outside docker |
| `EVAL_JUDGE_MODEL` | `KEMMA_MODEL_VERIFY` | Model that scores eval answers; keep it different from the writer |
| `KEMMA_MODEL_EMBEDDING` | `text-embedding-004` | Embeddings |
| `KEMMA_MODEL_IMAGE` | `gemini-3.8-flash` | Image generation |
| `KEMMA_MODEL_REPORT` | `qwen3.8-max` | Report writing |
| `KEMMA_MODEL_LONG_DOC` | `qwen3.8-max` | Long documents and heavy browsing |
| `KEMMA_MODEL_PLANNER` | `gemini-3.8-flash` | Deep-research planner |
| `KEMMA_MODEL_VERIFY` | `gemini-3.8-flash` | Citation verification |
| `KEMMA_MODEL_PRO` | `gemini-3.1-pro-preview` | Pro reasoning slot (exposed in the model list; no role switches to it automatically). 3.x is Vertex `global` only |
| `KEMMA_MODEL_PRO_FALLBACK` | `gemini-2.5-pro` | Tried when a `KEMMA_MODEL_PRO` call fails; empty disables it |
| `KEMMA_REASONING_EFFORT` | `low` | Thinking effort sent with Gemini flash chat calls (`low`, `medium`, `high`, or `off` to send nothing). Gemini flash can think for 3 to 20 seconds before answering, so the default is low. Pro models are never limited |
| `KEMMA_SEARCH_RPM` | `40` | Perplexity Sonar rate limit |
| `KEMMA_MAX_SUBAGENTS` | `1` | Parallel research sub-agents (max 5) |
| `KEMMA_TOOL_BUDGET` | `60` | Tool-call budget for Deep Research |
| `KEMMA_TOOL_CONCURRENCY` | `4` | Concurrency limit for parallel-safe tool calls in one step (P1-04) |
| `KEMMA_MAX_OUTPUT_TOKENS` | `8192` | Chat purpose output token cap override (default 8192). Report/long-doc cap stays 32768, planner/verify stays 2048 (P1-06) |
| `KEMMA_APPROVAL_TTL_SEC` | `600` | Expiration time for pending tool approvals in seconds (P1-11) |
| `ATTACH_MAX_MB` | `10` | Decoded size ceiling for one attached file (chat, Deep Research, document brief) and for a Drive file the server downloads or exports for them. Set to `5` to halve it; a non-positive or unparsable value falls back to `10`. Reference photos for image generation keep their own fixed 8 MB ceiling |

---

## Venice, VPS files and WhatsApp

| Variable | Default | What it does |
|---|---|---|
| `VENICE_API_KEY` | empty | Key for the Venice provider (admin-only unrestricted chat models routed as `venice/<id>`) |
| `VENICE_BASE_URL` | `https://api.venice.ai/api/v1` | Venice API base URL |
| `VENICE_MODELS` | `venice/venice-uncensored` | Comma-separated `venice/<id>` models offered to admins |
| `VENICE_TOOLS` | unset | Set to `1` to let Venice models call tools; otherwise they get no tools |
| `VENICE_SENSITIVE_ROUTING` | on when `VENICE_API_KEY` is set | Set to `0` to turn off routing of sensitive chats and images to Venice (kill switch). Per-thread setting `sensitiveRouting` is `auto` (default) or `off`. Admin accounts only. Blocked content (minors in a sexual context, content illegal to produce) is refused on every path regardless of this switch |
| `VENICE_SENSITIVE_MODEL` | `venice/venice-uncensored-1-2` | Venice chat model that answers sensitive messages (`venice/` prefix optional) |
| `VENICE_IMAGE_MODEL` | `lustify-v8` | Venice image model for sensitive image prompts, standard quality |
| `VENICE_IMAGE_MODEL_PRO` | `seedream-v5-pro` | Venice image model for sensitive image prompts, high quality |
| `SENSITIVE_CLASSIFIER` | on | Set to `0` to skip the small model pass for borderline text (borderline then counts as not sensitive) |
| `SENSITIVE_CLASSIFIER_MODEL` | the `KEMMA_MODEL_CHAT` model | Model id for the borderline-text classifier |
| `SENSITIVE_CLASSIFIER_TIMEOUT_MS` | `4000` | Deadline of the classifier call; on timeout or error the answer is "not sensitive" |
| `VPS_FILES_ROOTS` | `/vps` | Comma-separated container paths the admin-only `vps_files` tool may read (read-only; secret paths are blocked in code) |
| `WHATSAPP_BAILEYS` | unset | Set to `1` to start the WhatsApp bridge (links a spare number as a device) |
| `WHATSAPP_PAIR_NUMBER` | empty | Number (digits with country code) to link once; the pairing code appears on the admin pairing page |
| `WHATSAPP_ALLOWED_NUMBERS` | empty | Comma-separated digits that may talk to Kemma over WhatsApp; everyone else is ignored |
| `WHATSAPP_AUTH_DIR` | `/data/wa-auth` | Folder for the linked-device session (mount as a volume so restarts do not unlink) |
| `WHATSAPP_KEMMA_USER_ID` | lowest admin id | User that WhatsApp messages run as |
| `WHATSAPP_GRAPH_VERSION` | `v24.0` | Meta Graph API version used by the WhatsApp Cloud webhook |

## Image generation

`POST /api/fn/image` renders one image per request on the engine the user picked
(`server/routes/fn/image.ts` and `server/lib/fnImage.ts`). There is no fallback to
another engine: each one costs money and the choice is the user's. Per user the
function allows 20 images an hour and 100 a day.

| Variable | Default | Description |
|----------|---------|-------------|
| `IMAGE_ENGINE_DEFAULT` | `gemini` | Engine used when the request names none: `gemini`, `qwen`, `openai` or `forge`. An unknown value falls back to `gemini` |
| `KEMMA_MODEL_IMAGE` | `gemini-3.1-flash-image` | Gemini image model for quality `standard` |
| `KEMMA_MODEL_IMAGE_PRO` | `gemini-3-pro-image` | Gemini image model for quality `high` |
| `QWEN_IMAGE_MODEL` | `wan2.7-image` | Wan image model for quality `standard` |
| `QWEN_IMAGE_MODEL_PRO` | `wan2.7-image-pro` | Wan image model for quality `high` |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2` | Gateway image model, used for both qualities |
| `FORGE_MANAGER_URL` | unset | gpu-manager base URL, `http://172.18.0.1:8788` (the sr1_default gateway; the manager binds only there). The `forge` engine is offered only when this and the token are set |
| `FORGE_MANAGER_TOKEN` | unset | Shared token sent as `X-Manager-Token` (value in `/root/.gpu_manager_token` on the VPS) |
| `FORGE_MODEL` | `realisticVision_v60B1.safetensors` | Forge checkpoint for quality `standard` |
| `FORGE_MODEL_PRO` | `flux1-dev-bnb-nf4-v2.safetensors` | Forge checkpoint for quality `high` (Flux dev is non-commercial) |

An engine is offered only when it is configured: Gemini needs `GEMINI_BACKEND=vertex`
with readable `GOOGLE_APPLICATION_CREDENTIALS`, or `GEMINI_API_KEY`; Qwen needs
`QWEN_API_KEY`; the OpenAI route needs `LITELLM_API_KEY` or `KOBOILLM_API_KEY`. Keys,
URLs with keys and storage paths are never returned to the client.

The `forge` engine runs Stable Diffusion Forge on a Jarvislabs GPU. It never talks to
Jarvislabs or Forge directly: it posts to the `gpu-manager` systemd service on the VPS
(`/root/gpu-manager/gpu_manager.py`), which holds the Jarvislabs key and the Forge login,
resumes the paused instance for a request (about 30 s cold), and pauses it again after
`IDLE_SECONDS` (120) with nothing running.

The Gemini image models are served from Vertex `global` only: image calls always go to
`locations/global` and ignore `VERTEX_LOCATION`, which stays reserved for the chat and
vision roles. Qwen images use the native `multimodal-generation` route on the host of
`QWEN_BASE_URL`, not the `compatible-mode` path (the OpenAI `images` route answers 404
there). OpenAI images go to `{LITELLM_BASE_URL}/images/generations`.

`KEMMA_MODEL_IMAGE` names a text model for the Kemma router (see the table above); the
image function reads the same variable and expects a Gemini image model id.

---

## Video generation

`POST /api/fn/video/start` enqueues a video generation job that runs asynchronously
via pg-boss (`server/routes/fn/video.ts` and `server/lib/fnVideo.ts`). Status is
polled via `GET /api/fn/video/status?id=<jobId>` and jobs can be cancelled via
`POST /api/fn/video/cancel`. Per user the function allows 10 videos an hour and 30 a day.

| Variable | Default | Description |
|----------|---------|-------------|
| `VIDEO_ENGINE_DEFAULT` | `gemini` | Engine used when the request names none: `openai`, `gemini`, `qwen` or `forge`. If unset or unavailable, falls back to the first available engine |
| `KEMMA_MODEL_VIDEO` | `veo-3.1-fast-generate-preview` | Gemini video model for quality `standard` |
| `KEMMA_MODEL_VIDEO_PRO` | `veo-3.1-generate-preview` | Gemini video model for quality `high` |
| `QWEN_VIDEO_MODEL` | `wan2.1-t2v-turbo` | Wan video model for quality `standard` |
| `QWEN_VIDEO_MODEL_PRO` | `wan2.1-t2v-plus` | Wan video model for quality `high` |
| `OPENAI_VIDEO_MODEL` | `sora-1.0-turbo` | OpenAI video model for quality `standard` |
| `OPENAI_VIDEO_MODEL_PRO` | `sora-1.0` | OpenAI video model for quality `high` |
| `FORGE_VIDEO_MODEL` | `wan2.1-t2v-1.3b` | Open-weight GPU video model for quality `standard` |
| `FORGE_VIDEO_MODEL_PRO` | `ltx-video-2b` | Open-weight GPU video model for quality `high` |
| `OPENAI_VIDEO_API_KEY` | empty | Dedicated API key for OpenAI video generation |
| `OPENAI_VIDEO_BASE_URL` | `https://api.openai.com/v1` | Dedicated endpoint for OpenAI video generation |
| `QWEN_VIDEO_API_KEY` | empty | Dedicated DashScope API key with video-synthesis permissions |
| `QWEN_VIDEO_BASE_URL` | `https://dashscope-intl.aliyuncs.com` | DashScope video endpoint base URL |

An engine is offered only when it is configured: Gemini needs `GEMINI_BACKEND=vertex`
with readable `GOOGLE_APPLICATION_CREDENTIALS`, or `GEMINI_API_KEY` (AI Studio); Qwen
needs `QWEN_VIDEO_API_KEY` (the token plan key does not support async video synthesis);
OpenAI needs `OPENAI_VIDEO_API_KEY` (the gateway currently provides no video models);
and Forge needs `FORGE_MANAGER_URL` and `FORGE_MANAGER_TOKEN`.

---

## Chat image commands

`/image`, `/img` and `/draw` in an allowlisted Telegram chat, or from a linked
WhatsApp number that is allowed, draw one picture and send it back as a photo
(`server/lib/chatImage.ts`, the same engines as the image function above).

| Variable | Default | Description |
|----------|---------|-------------|
| `CHAT_IMAGE_ENGINE` | `forge` | Engine a chat command runs on when the message names none: `gemini`, `qwen`, `openai` or `forge` (`gpu` in the message). An unknown value falls back to `forge` |
| `CHAT_IMAGE_NATURAL` | on | Plain sentences such as "draw me a cat" or "make a picture of a lighthouse" count as image requests in Telegram and WhatsApp. Set `0` to require the `/image` command |
| `CHAT_IMAGE_PER_HOUR` | `6` | Images per chat in a rolling hour. Anything that is not a positive integer uses the default |
| `CHAT_IMAGE_PER_DAY` | `30` | Images per chat in a rolling 24 hours. Attempts count, failures included. Both windows are in memory, so a server restart clears them |

A message may put `high` (quality high, Flux on the GPU), one of `gpu`, `gemini`,
`qwen`, `openai` and one of `square`, `wide`, `tall`, `landscape`, `portrait` in
front of the prompt, in any order. One job runs per chat at a time, and an engine
that is not configured is answered as unavailable: the command never switches to
another one. The picture is also stored under the account the WhatsApp bridge
runs as (`WHATSAPP_KEMMA_USER_ID`, else the lowest admin id).

---

## Feature flags

Behavior that ships dark is switched with `FF_<NAME>` variables, registered in
`server/core/flags.ts` (one entry per flag, with its default and a description).
They are read on every check, so a restart is enough to change one. `1`, `true`
and `on` (any case) turn a flag on, any other non-empty value turns it off, and
an unset or blank variable means the default.

| Variable | Default | Description |
|----------|---------|-------------|
| `FF_STREAM_TOOL_TURNS` | off | Stream every model call, tool turns included, and emit `thinking` and `segment` events (P1-03) |
| `FF_PARALLEL_TOOLS` | off | Run the parallel-safe tool calls of one step concurrently (P1-04) |
| `FF_AUTO_CONTINUE` | off | Continue a final answer cut off by the output limit, at most twice (P1-06) |
| `FF_SEARCH_V2` | off | Search through the provider layer instead of the Sonar path (P1-08) |
| `FF_READER_V2` | off | Read pages with the tiered reader instead of a browser agent per URL (P1-09) |
| `FF_UNTRUSTED_FENCING` | **on** | Fence content from outside sources in tool results so the model treats it as data (P1-10). Set `0` to turn it off |
| `FF_APPROVALS` | off | Ask the user to approve write tools that act outside Sutaeru; off hides those tools (P1-11) |
| `FF_ACTION_TOOLS` | off | Offer the email, calendar, image, video and monitor tools to the agent (P1-12) |
| `FF_CONTEXT_MANAGER` | off | Keep each model call under its token budget with result handles and compaction (P1-13) |

---

## Tests and bench

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_DATABASE_URL` | empty | Scratch Postgres for `npm run test:db` (`*.db.test.ts`). Those tests skip when it is empty. Migrate it first with `DATABASE_URL=$TEST_DATABASE_URL npm run migrate`. Never point it at a real database: the tests write and delete rows. CI sets it to its own service container |

`npm run bench` (`scripts/bench-chat.ts`) reads the app's `.env` (the provider keys
and `DATABASE_URL`, for the `usage_logs` cost rows), `EVAL_USER_ID` (or `--user`) and
`EVAL_DB_HOST`. Put the bench user in `KEMMA_UNLIMITED_USER_IDS` so daily quotas do
not stop a run. The bench sets `KEMMA_SEARCH_CACHE_TTL_SEC=0` for its own process
unless `--cache` is passed.

---

## 🔍 Verification Commands

Production runs on Cloud Run (service `sutaeru`, region `asia-southeast2`), not a local container.

```bash
# Check the env vars configured on the live service
gcloud run services describe sutaeru --region asia-southeast2 \
  --format="yaml(spec.template.spec.containers[0].env)"

# Tail recent logs (secret load status, migration status, startup errors)
gcloud run services logs read sutaeru --region asia-southeast2 --limit 50

# Test endpoints
curl -I https://sutaeru.com
curl -I http://localhost:3000   # local dev only
```

---

*Document generated by Kimi CLI*
| `CODE_SESSIONS_ENABLED` | unset | Kill switch for Code sessions. Only `1` turns them on |
| `CODE_SESSIONS_FULL` | `0` | Enable "Full access" mode for Code sessions. Only `1` allows starting sessions in full mode (requires 2FA code verification) |
| `CODE_SESSIONS_URL` | unset | Session daemon base URL, `http://172.18.0.1:8789` (the sr1_default gateway; the daemon binds only there) |
| `CODE_SESSIONS_TOKEN` | unset | Bearer token for the daemon (value in `/root/.session_manager_token` on the VPS) |
| `CODE_SESSIONS_PROJECTS` | `sutaeru:/root/sr1` | Folders a session may start in, `name:/path` pairs separated by commas. Paths must be under `/root/` |
