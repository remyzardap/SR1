# Sutaeru Environment Variables Documentation

> Generated: March 21, 2026
> Project: Sutaeru (S1PRONTO)
> Domain: https://sutaeru.com

---

## 📋 Quick Reference

| Category | Count | Status |
|----------|-------|--------|
| Core Application | 5 | ✅ Configured |
| Database | 1 | ✅ Configured |
| AI/LLM APIs | 8 | ✅ Configured |
| Voice/Speech | 3 | ✅ Configured |
| Search | 1 | ✅ Configured |
| Google/Vertex AI | 5 | ✅ Configured |
| **Total** | **23** | **✅ All Set** |

---

## 🔧 Core Application Variables

| Variable | Value | Location | Description |
|----------|-------|----------|-------------|
| `NODE_ENV` | `production` | Container + Coolify | Application environment mode |
| `PORT` | `5000` (internal) / `3000` (external) | Container | Internal app port (maps to 3000) |
| `APP_URL` | `https://sutaeru.com` | Container + Coolify | Production URL |
| `VITE_APP_ID` | `sutaeru` | Container + Coolify | App identifier for Vite |
| `SESSION_SECRET` | `[64-char hex]` | Container + Coolify | Session encryption key |

---

## 🗄️ Database

| Variable | Value | Location | Description |
|----------|-------|----------|-------------|
| `DATABASE_URL` | `postgresql://sutaeru:sutaeru123@coolify-db:5432/sutaeru` | Container + Coolify | PostgreSQL connection string |

**Connection Details:**
- **Host:** `coolify-db` (Docker network)
- **Port:** `5432`
- **Database:** `sutaeru`
- **Username:** `sutaeru`
- **Password:** `sutaeru123`

---

## 🤖 AI / LLM API Keys

### Anthropic (Claude)
```
ANTHROPIC_API_KEY=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
```

### OpenAI
```
OPENAI_API_KEY=placeholder-openai-key
```
> ⚠️ Currently using placeholder - update for Whisper STT

### Kimi
```
KIMI_API_KEY=skN6SAOespSaz7TCRZ8FKThk35T8j54YUR6v
```

### Google / Gemini / Vertex AI
```
GOOGLE_API_KEY=vertex-ai-via-litellm
GEMINI_API_KEY=vertex-ai-via-litellm
```

### Perplexity (Search)
```
PERPLEXITY_API_KEY=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
```

### NVIDIA
```
NVIDIA_API_KEY=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
```

### LiteLLM Proxy
```
LITELLM_BASE_URL=https://litellm.koboi2026.biz.id/v1
```

---

## 🔊 Voice & Speech (ElevenLabs)

| Variable | Value | Description |
|----------|-------|-------------|
| `ELEVEN_LABS_API_KEY` | `sk_adca52ab96f5af26b1164d19e44997b56c282975d3d67b16` | Text-to-Speech API |
| `ELEVEN_LABS_AGENT_ID` | `agent_9201kjn4s3hmf97a1t65hvvxzvm4` | Conversational AI Agent |
| `ELEVEN_LABS_VOICE_ID` | `JSWO6cw2AyFE324d5kErE` | Voice preset |

---

## 🔐 Google Vertex AI Configuration

### Service Account (Main)
```
GOOGLE_APPLICATION_CREDENTIALS=/app/credentials.json
VERTEX_PROJECT_ID=project-3d2c7b4f-06a4-4814-8fa
VERTEX_LOCATION=us-central1
```

### Service Account (Kimi)
```
VERTEX_KIMI_KEY=/app/vertex-kimi.json
VERTEX_KIMI_PROJECT_ID=s1herprojectx-488908
```

**Credential Files:**
- `/home/ubuntu/sutaeru_vertex.json` → Mounted at `/app/credentials.json`
- Contains: `vertex-express@s1herprojectx-488908.iam.gserviceaccount.com`

---

## 📁 File Locations

| File | Host Path | Container Path | Description |
|------|-----------|----------------|-------------|
| Vertex Credentials | `/home/ubuntu/sutaeru_vertex.json` | `/app/credentials.json` | Google Service Account |
| .env | `/home/ubuntu/S1PRONTO-main/.env` | — | Source of truth |
| Coolify Config | — | Coolify DB | Deployment variables |

---

## 🚀 Deployment Status

| Platform | Status | Variables Synced |
|----------|--------|------------------|
| Docker Container (sutaeru) | ✅ Running | 10 variables |
| Coolify (sutaeru-app) | 🟡 Queued | 11 variables |
| GitHub Repo | — | .env not committed |

---

## 📝 Environment Files

### Source File
```bash
/home/ubuntu/S1PRONTO-main/.env
```

### Coolify UI
```
http://localhost:8000 → Project: sutaeru-app → Environment Variables
```

---

## ⚠️ Notes & Warnings

1. **OPENAI_API_KEY** is currently a placeholder - update for Whisper STT functionality
2. **SESSION_SECRET** in Coolify differs from .env file (auto-generated)
3. **PORT** mapping: Container uses 5000 internally, exposed as 3000 externally
4. **SSL Certificates** are auto-managed by Traefik/Let's Encrypt

---

## 🔍 Verification Commands

```bash
# Check container env vars
docker inspect sutaeru --format='{{range .Config.Env}}{{.}}{{\"\n\"}}{{end}}'

# Check Coolify database
docker exec coolify-db psql -U coolify -d coolify -c "SELECT key FROM environment_variables WHERE resourceable_id = 1;"

# Test endpoints
curl -I https://sutaeru.com
curl -I http://localhost:3000
```

---

## 🆕 Stage A Additions (set in `.env`, values left empty here)

| Variable | Default | Description |
|----------|---------|-------------|
| `QWEN_API_KEY` | — | Qwen compatible-mode API key |
| `QWEN_BASE_URL` | `https://token-plan.maas.qwencloudapi.com/compatible-mode/v1` | Qwen OpenAI-compatible base URL |
| `NVIDIA_API_KEY` | — | NVIDIA API key (used only for Nemotron) |
| `KEMMA_MODEL_CHAT` | `qwen3.8-max` | Everyday chat, tools, code, file generation |
| `KEMMA_MODEL_SEARCH` | `sonar-pro` | Web search model |
| `KEMMA_MODEL_VISION` | `gemini-3.8-flash` | Vision and documents |
| `KEMMA_MODEL_EMBEDDING` | `text-embedding-004` | Embeddings |
| `KEMMA_MODEL_IMAGE` | `gemini-3.8-flash` | Image generation |
| `KEMMA_MODEL_REPORT` | `qwen3.8-max` | Report writing |
| `KEMMA_MODEL_LONG_DOC` | `kimi-k3` | Long documents and heavy browsing |
| `KEMMA_MODEL_PLANNER` | `claude-sonnet-5` | Deep-research planner |
| `KEMMA_MODEL_VERIFY` | `claude-sonnet-5` | Citation verification |
| `KEMMA_MODEL_POLISH` | — | Optional final polish via LiteLLM |
| `KEMMA_MODEL_NEMOTRON` | — | Optional Nemotron model |
| `KEMMA_SEARCH_RPM` | `40` | Perplexity Sonar rate limit |
| `KEMMA_MAX_SUBAGENTS` | `1` | Parallel research sub-agents (max 5) |
| `KEMMA_TOOL_BUDGET` | `60` | Tool-call budget for Deep Research |
| `KEMMA_CAP_ANTHROPIC` | `0` | Monthly Anthropic spend cap (USD, 0 = unlimited) |
| `KEMMA_CAP_OPENAI` | `0` | Monthly OpenAI spend cap (USD, 0 = unlimited) |
| `ALLOWED_LOGIN` | — | Comma-separated allowed emails/handles |
| `SEED_TEST_PASSWORD` | — | Bootstrap password for the first account |
| `STORAGE_DRIVER` | `local` | Storage backend: local, forge, or drive |
| `STORAGE_LOCAL_ROOT` | `/root/sr1-data/files` | Local filesystem storage path |
| `STORAGE_LOCAL_URL` | `/files` | Public URL path for local files |
| `DRIVE_ROOT_FOLDER_ID` | — | Google Drive root folder id for Sutaeru files |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | — | Key for encrypting stored Google tokens |

---

*Document generated by Kimi CLI*
