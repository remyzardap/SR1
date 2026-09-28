# 🔐 Google Secret Manager Integration

Sutaeru automatically loads secrets from **Google Secret Manager** at startup. This provides secure, centralized secret management for production deployments.

## How It Works

1. **Startup**: When the server starts, it attempts to load secrets from Secret Manager
2. **Fallback**: If a secret isn't in Secret Manager, it falls back to environment variables
3. **Local Dev**: Set `SKIP_SECRET_MANAGER=true` to use local `.env` file only

## Quick Start

### 1. Set a Single Secret

```bash
./scripts/set-secret.sh DATABASE_URL "postgresql://user:pass@host/db"
```

### 2. Bulk Upload from .env File

```bash
# First, create your .env file with all secrets
cat > .env << 'EOF'
DATABASE_URL=postgresql://...
VITE_APP_ID=sutaeru-app
SESSION_SECRET=your-random-secret
ANTHROPIC_API_KEY=sk-ant-...
KIMI_API_KEY=sk-...
VERTEX_API=your-vertex-key
EOF

# Then upload to Secret Manager
./scripts/set-secrets-from-env.sh .env
```

### 3. Run the App

```bash
# Production - uses Secret Manager automatically
npm run start

# Development - uses Secret Manager (or set SKIP_SECRET_MANAGER=true for local .env)
npm run dev
```

## Available Secrets

| Secret | Description | Required |
|--------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | ✅ Yes |
| `VITE_APP_ID` | Application identifier | ✅ Yes |
| `SESSION_SECRET` | Cookie/Auth encryption key | ✅ Yes |
| `OWNER_OPEN_ID` | Initial admin OpenID | ❌ No |
| `KIMI_API_KEY` | Kimi AI integration | ❌ No |
| `ANTHROPIC_API_KEY` | Claude integration | ❌ No |
| `VERTEX_API` | Vertex AI integration | ❌ No |
| `OPENAI_API_KEY` | OpenAI integration | ❌ No |
| `GEMINI_API_KEY` | Google Gemini integration | ❌ No |
| `SONAR_API_KEY` | Perplexity Sonar integration | ❌ No |
| `ELEVEN_LABS_API_KEY` | Voice synthesis | ❌ No |
| `ELEVEN_LABS_AGENT_ID` | ElevenLabs agent | ❌ No |
| `ELEVEN_LABS_VOICE_ID` | Voice ID | ❌ No |
| `EMAIL_HOST` | SMTP server | ❌ No |
| `EMAIL_USER` | SMTP username | ❌ No |
| `EMAIL_PASSWORD` | SMTP password | ❌ No |
| `APP_URL` | Public app URL | ❌ No |

## Manual Secret Management

### List All Secrets
```bash
gcloud secrets list --project=994031575796
```

### View a Secret Version
```bash
gcloud secrets versions access latest --secret=DATABASE_URL --project=994031575796
```

### Delete a Secret
```bash
gcloud secrets delete DATABASE_URL --project=994031575796
```

## Configuration

### Disable Secret Manager (Local Dev)

```bash
export SKIP_SECRET_MANAGER=true
npm run dev
```

### Change Project ID

```bash
export GOOGLE_CLOUD_PROJECT=your-project-id
npm run start
```

## Security Notes

- Secrets are encrypted at rest by Google Secret Manager
- The app never logs secret values
- Secrets are loaded once at startup and cached in memory
- Service account needs `roles/secretmanager.secretAccessor` role

## Troubleshooting

**"Could not get access token"**
- Run `gcloud auth application-default login` or
- Ensure you're running on GCP with proper service account

**"Secret not found"**
- Secret hasn't been created yet - use the set-secret.sh scripts
- Or check project ID: `gcloud config get-value project`

**Permission denied**
- Grant Secret Manager access: `gcloud projects add-iam-policy-binding PROJECT_ID --member="user:YOU@email.com" --role="roles/secretmanager.admin"`
