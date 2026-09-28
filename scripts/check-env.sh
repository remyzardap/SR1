#!/usr/bin/env bash
# check-env.sh — prints SET / EMPTY / MISSING per variable (NEVER values or lengths).
# Exits 1 if any REQUIRED variable is empty or missing; 2 if the env file is absent.
# Usage: bash scripts/check-env.sh [path-to-env-file]

ENV_FILE="${1:-/root/sr1/.env}"
[ -f "$ENV_FILE" ] || { echo "env file not found: $ENV_FILE"; exit 2; }

REQUIRED="NODE_ENV PORT APP_URL VITE_APP_ID SESSION_SECRET DATABASE_URL QWEN_API_KEY GEMINI_API_KEY SONAR_API_KEY"

ALL="NODE_ENV PORT APP_URL VITE_APP_ID SESSION_SECRET OWNER_OPEN_ID \
DATABASE_URL DB_PASSWORD \
VERTEX_PROJECT VERTEX_LOCATION GOOGLE_APPLICATION_CREDENTIALS \
GEMINI_API_KEY SONAR_API_KEY \
QWEN_API_KEY QWEN_BASE_URL \
ELEVEN_LABS_API_KEY ELEVEN_LABS_AGENT_ID ELEVEN_LABS_VOICE_ID \
E2B_API_KEY E2B_SANDBOX_TEMPLATE BROWSER_USE_API_KEY \
EMAIL_HOST EMAIL_PORT EMAIL_USER EMAIL_PASSWORD EMAIL_FROM \
STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET \
AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_REGION AWS_S3_BUCKET \
GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET DRIVE_ROOT_FOLDER_ID TELEGRAM_BOT_TOKEN \
ALLOWED_LOGIN SEED_TEST_PASSWORD \
KEMMA_SEARCH_RPM \
KEMMA_MODEL_IMAGE KEMMA_MODEL_REPORT KEMMA_MODEL_PLANNER KEMMA_MODEL_VERIFY"

status() { # prints SET | EMPTY | MISSING for a variable name; never prints its value
  local line
  line=$(grep -E "^${1}=" "$ENV_FILE" | tail -n 1)
  if [ -z "$line" ]; then echo "MISSING"; return; fi
  local v="${line#*=}"
  v="${v#\"}"; v="${v%\"}"
  v=$(printf '%s' "$v" | tr -d '[:space:]')
  if [ -n "$v" ]; then echo "SET"; else echo "EMPTY"; fi
}

fail=0
echo "== required (must be SET) =="
for v in $REQUIRED; do
  s=$(status "$v")
  printf '%-28s %s\n' "$v" "$s"
  [ "$s" = "SET" ] || fail=1
done
echo "== optional =="
for v in $ALL; do
  case " $REQUIRED " in *" $v "*) continue ;; esac
  printf '%-28s %s\n' "$v" "$(status "$v")"
done

if [ "$fail" -ne 0 ]; then
  echo "RESULT: FAIL (one or more required variables are EMPTY/MISSING)"
else
  echo "RESULT: OK (all required variables are SET)"
fi
exit $fail
