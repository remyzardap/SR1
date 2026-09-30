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
| `EVAL_USER_ID` | `199` | User id the research eval runs as |
| `EVAL_DB_HOST` | empty | Replaces the host in `DATABASE_URL` when the eval runs on the VPS host outside docker |
| `EVAL_JUDGE_MODEL` | `KEMMA_MODEL_VERIFY` | Model that scores eval answers; keep it different from the writer |
| `KEMMA_MODEL_EMBEDDING` | `text-embedding-004` | Embeddings |
| `KEMMA_MODEL_IMAGE` | `gemini-3.8-flash` | Image generation |
| `KEMMA_MODEL_REPORT` | `qwen3.8-max` | Report writing |
| `KEMMA_MODEL_LONG_DOC` | `qwen3.8-max` | Long documents and heavy browsing |
| `KEMMA_MODEL_PLANNER` | `gemini-3.8-flash` | Deep-research planner |
| `KEMMA_MODEL_VERIFY` | `gemini-3.8-flash` | Citation verification |
| `KEMMA_MODEL_PRO` | `gemini-3.1-pro-preview` | Pro reasoning slot (exposed in the model list; no role switches to it automatically). 3.x is Vertex `global` only |
| `KEMMA_MODEL_PRO_FALLBACK` | `gemini-2.5-pro` | Tried when a `KEMMA_MODEL_PRO` call fails; empty disables it |
| `KEMMA_SEARCH_RPM` | `40` | Perplexity Sonar rate limit |
| `KEMMA_MAX_SUBAGENTS` | `1` | Parallel research sub-agents (max 5) |
| `KEMMA_TOOL_BUDGET` | `60` | Tool-call budget for Deep Research |

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
