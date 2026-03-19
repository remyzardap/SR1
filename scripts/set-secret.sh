#!/bin/bash
# Set a secret in Google Secret Manager
# Usage: ./scripts/set-secret.sh SECRET_NAME "secret value"

set -e

SECRET_NAME=$1
SECRET_VALUE=$2
PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-"994031575796"}

if [ -z "$SECRET_NAME" ] || [ -z "$SECRET_VALUE" ]; then
  echo "Usage: ./scripts/set-secret.sh SECRET_NAME \"secret value\""
  echo ""
  echo "Available secrets:"
  echo "  DATABASE_URL, VITE_APP_ID, SESSION_SECRET, OWNER_OPEN_ID"
  echo "  KIMI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY"
  echo "  SONAR_API_KEY, VERTEX_API, ELEVEN_LABS_API_KEY"
  echo "  EMAIL_HOST, EMAIL_USER, EMAIL_PASSWORD, etc."
  exit 1
fi

echo "Setting secret: $SECRET_NAME"
echo -n "$SECRET_VALUE" | gcloud secrets versions add "$SECRET_NAME" --data-file=- --project="$PROJECT_ID"

echo "✅ Secret $SECRET_NAME updated successfully!"
