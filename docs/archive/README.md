# Archived docs

These describe an earlier deployment (a VPS with Docker Compose and Caddy, LiteLLM/DALL-E/Kimi/Anthropic/OpenAI
providers) that the project has moved on from. Kept for history; do not follow them for the current setup.

Current deployment: Google Cloud Run, service `sutaeru`, region `asia-southeast2`, project
`project-3d2c7b4f-06a4-4814-8fa`. Config (env vars, scaling, Cloud SQL connection) lives on the Cloud Run
service itself — `gcloud run services describe sutaeru --region asia-southeast2` — not in a checked-in file.
Secrets are loaded at startup from Google Secret Manager (`server/_core/secretManager.ts`); see
`ENVIRONMENT_VARIABLES.md` at the repo root for what each one is for.
