#!/bin/bash
# Bulk upload secrets from .env file to Google Secret Manager
# Usage: ./scripts/set-secrets-from-env.sh [path-to-env-file]

set -e

ENV_FILE=${1:-".env"}
PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-"994031575796"}

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ File not found: $ENV_FILE"
  echo "Usage: ./scripts/set-secrets-from-env.sh [path-to-env-file]"
  exit 1
fi

echo "📤 Uploading secrets from $ENV_FILE to Secret Manager..."
echo ""

# Secrets to upload (whitelist)
ALLOWED_SECRETS=(
  "DATABASE_URL"
  "VITE_APP_ID"
  "SESSION_SECRET"
  "OWNER_OPEN_ID"
  "KIMI_API_KEY"
  "OPENAI_API_KEY"
  "ANTHROPIC_API_KEY"
  "GEMINI_API_KEY"
  "SONAR_API_KEY"
  "VERTEX_API"
  "ELEVEN_LABS_API_KEY"
  "ELEVEN_LABS_AGENT_ID"
  "ELEVEN_LABS_VOICE_ID"
  "EMAIL_HOST"
  "EMAIL_PORT"
  "EMAIL_USER"
  "EMAIL_PASSWORD"
  "EMAIL_FROM"
  "APP_URL"
  "BUILT_IN_FORGE_API_URL"
  "BUILT_IN_FORGE_API_KEY"
)

while IFS= read -r line || [[ -n "$line" ]]; do
  # Skip comments and empty lines
  [[ "$line" =~ ^#.*$ ]] && continue
  [[ -z "$line" ]] && continue
  
  # Parse KEY=VALUE
  if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
    KEY="${BASH_REMATCH[1]}"
    VALUE="${BASH_REMATCH[2]}"
    
    # Remove quotes if present
    VALUE="${VALUE%\"}"
    VALUE="${VALUE#\"}"
    VALUE="${VALUE%\'}"
    VALUE="${VALUE#\'}"
    
    # Check if this is an allowed secret
    if [[ " ${ALLOWED_SECRETS[@]} " =~ " ${KEY} " ]]; then
      echo "Setting: $KEY"
      echo -n "$VALUE" | gcloud secrets versions add "$KEY" --data-file=- --project="$PROJECT_ID" 2>/dev/null || {
        echo "  Creating new secret: $KEY"
        gcloud secrets create "$KEY" --replication-policy="automatic" --project="$PROJECT_ID"
        echo -n "$VALUE" | gcloud secrets versions add "$KEY" --data-file=- --project="$PROJECT_ID"
      }
    else
      echo "⏭️  Skipping: $KEY (not in allowed list)"
    fi
  fi
done < "$ENV_FILE"

echo ""
echo "✅ All secrets uploaded successfully!"
