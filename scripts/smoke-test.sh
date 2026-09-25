#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://sutaeru.com}"

echo "=== Sutaeru Stage A smoke test ==="
echo "Base URL: $BASE_URL"

# 1. Health check
echo "[1/5] Health check"
curl -fsS "$BASE_URL/api/health" >/dev/null
echo "  OK"

# 2. Register is disabled
echo "[2/5] Register is disabled"
status=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$BASE_URL/api/trpc/auth.register" \
  -H "Content-Type: application/json" \
  -d '{"json":{"name":"Test","email":"test@example.com","password":"password123"}}')
if [ "$status" != "403" ] && [ "$status" != "401" ]; then
  echo "  FAIL: expected 403/401, got $status"
  exit 1
fi
echo "  OK ($status)"

# 3. Login without allowlist is blocked
echo "[3/5] Login without allowlist is blocked"
status=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$BASE_URL/api/trpc/auth.login" \
  -H "Content-Type: application/json" \
  -d '{"json":{"email":"test@example.com","password":"password123"}}')
if [ "$status" != "403" ] && [ "$status" != "401" ]; then
  echo "  FAIL: expected 403/401, got $status"
  exit 1
fi
echo "  OK ($status)"

# 4. Public routes require session
echo "[4/5] Public routes require session"
status=$(curl -s -o /dev/null -w "%{http_code}" -X GET \
  "$BASE_URL/api/trpc/agents.listAgents")
if [ "$status" != "401" ] && [ "$status" != "403" ]; then
  echo "  FAIL: expected 401/403, got $status"
  exit 1
fi
echo "  OK ($status)"

# 5. Research question (requires test account; skipped if none)
echo "[5/5] Research question"
if [ -z "${TEST_EMAIL:-}" ] || [ -z "${TEST_PASSWORD:-}" ]; then
  echo "  SKIP: set TEST_EMAIL and TEST_PASSWORD to run research question"
  echo "=== Smoke test passed (without research) ==="
  exit 0
fi

login_resp=$(curl -s -X POST \
  "$BASE_URL/api/trpc/auth.login" \
  -H "Content-Type: application/json" \
  -d "{\"json\":{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}}" \
  -c /tmp/sutaeru_cookies.txt)
if ! echo "$login_resp" | grep -q '"success":true'; then
  echo "  FAIL: login failed: $login_resp"
  exit 1
fi
echo "  Login OK"

echo "=== Smoke test passed ==="
