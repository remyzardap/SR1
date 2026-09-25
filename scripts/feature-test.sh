#!/usr/bin/env bash
set -uo pipefail

BASE_URL="${BASE_URL:-https://sutaeru.com}"
COOKIE_JAR="/tmp/sutaeru_feature_test_cookies.txt"

PASS=0
FAIL=0
RESULTS=""

# Login first
TEST_PW="${TEST_PASSWORD:-}"
if [ -z "$TEST_PW" ]; then
  echo "Set TEST_PASSWORD env var"
  exit 1
fi

login_resp=$(curl -s -X POST "$BASE_URL/api/trpc/auth.login" \
  -H "Content-Type: application/json" \
  --data-binary @- \
  -c "$COOKIE_JAR" <<EOF
{"json":{"email":"test@sutaeru.com","password":"$TEST_PW"}}
EOF
)
if echo "$login_resp" | grep -q '"success":true'; then
  echo "✅ auth.login"
else
  echo "❌ auth.login: $login_resp"
  exit 1
fi

test_query() {
  local name="$1"
  local path="$2"
  local expected_keys="$3"
  resp=$(curl -s -X GET "$BASE_URL/api/trpc/$path" -b "$COOKIE_JAR")
  if echo "$resp" | grep -q "$expected_keys"; then
    echo "✅ $name"
    PASS=$((PASS+1))
  else
    echo "❌ $name: $(echo "$resp" | head -c 200)"
    FAIL=$((FAIL+1))
  fi
}

test_mutation() {
  local name="$1"
  local path="$2"
  local body="$3"
  local expected="$4"
  resp=$(curl -s -X POST "$BASE_URL/api/trpc/$path" \
    -H "Content-Type: application/json" \
    -d "$body" -b "$COOKIE_JAR")
  if echo "$resp" | grep -q "$expected"; then
    echo "✅ $name"
    PASS=$((PASS+1))
  else
    echo "❌ $name: $(echo "$resp" | head -c 300)"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo "=== Auth ==="
test_query "auth.me" "auth.me" '"id"'
test_mutation "auth.logout" "auth.logout" '{}' '"success":true'
# Login again after logout
login_resp=$(curl -s -X POST "$BASE_URL/api/trpc/auth.login" \
  -H "Content-Type: application/json" \
  --data-binary @- \
  -c "$COOKIE_JAR" <<EOF
{"json":{"email":"test@sutaeru.com","password":"$TEST_PW"}}
EOF
)
if echo "$login_resp" | grep -q '"success":true'; then
  echo "✅ auth.login (re-login)"
else
  echo "❌ auth.login (re-login)"
fi

echo ""
echo "=== Kemma / Chat ==="
test_query "kemma.availableModels" "kemma.availableModels" '"id"'
test_query "kemma.approvedSkills" "kemma.approvedSkills" '\['
test_query "kemma.quota" "kemma.quota" '"tier"'
test_mutation "kemma.execute" "kemma.execute" '{"json":{"messages":[{"role":"user","content":"hello"}]}}' '"response"'

echo ""
echo "=== Chat Sessions ==="
test_query "chat.listSessions" "chat.listSessions" '\['
test_mutation "chat.createSession" "chat.createSession" '{"json":{"title":"Test Session"}}' '"id"'
# Get first session id
session_id=$(curl -s -X GET "$BASE_URL/api/trpc/chat.listSessions" -b "$COOKIE_JAR" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["result"]["data"]["json"][0]["id"] if d.get("result") and d["result"].get("data") and d["result"]["data"].get("json") and len(d["result"]["data"]["json"])>0 else "")')
if [ -n "$session_id" ]; then
  test_query "chat.getMessages" "chat.getMessages?input=$(python3 -c 'import json,urllib.parse; print(urllib.parse.quote(json.dumps({"json":{"sessionId":"'$session_id'"}})))')" '\['
  test_mutation "chat.renameSession" "chat.renameSession" "{\"json\":{\"sessionId\":\"$session_id\",\"title\":\"Renamed\"}}" '"success":true'
  test_mutation "chat.deleteSession" "chat.deleteSession" "{\"json\":{\"sessionId\":\"$session_id\"}}" '"success":true'
else
  echo "⚠️ no session to test get/rename/delete"
fi

echo ""
echo "=== Identity / Profile ==="
test_query "identity.get" "identity.get" '"handle"'
test_query "identity.getStats" "identity.getStats" '"skillsCount"'
test_query "profile.getByHandle" "profile.getByHandle?input=$(python3 -c 'import json,urllib.parse; print(urllib.parse.quote(json.dumps({"json":{"handle":"testuser"}})))')" '"handle"'

echo ""
echo "=== Skills / Memories / Connections ==="
test_query "skills.list" "skills.list" '\['
test_query "skills.discover" "skills.discover" '\['
test_query "memories.list" "memories.list" '\['
test_query "connections.list" "connections.list" '\['

echo ""
echo "=== Files ==="
test_query "files.list" "files.list" '\['

echo ""
echo "=== Settings ==="
test_query "settings.getApiKey" "settings.getApiKey" '"provider"\|"apiKey"\|null'

echo ""
echo "=== Admin / Public ==="
# Register should be disabled
reg_resp=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/trpc/auth.register" \
  -H "Content-Type: application/json" \
  -d '{"json":{"name":"Test","email":"test@example.com","password":"password123"}}')
if [ "$reg_resp" = "403" ] || [ "$reg_resp" = "401" ]; then
  echo "✅ auth.register disabled ($reg_resp)"
  PASS=$((PASS+1))
else
  echo "❌ auth.register disabled expected 403/401 got $reg_resp"
  FAIL=$((FAIL+1))
fi

# Public route without session
public_resp=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/api/trpc/agents.listAgents")
if [ "$public_resp" = "401" ] || [ "$public_resp" = "403" ]; then
  echo "✅ agents.listAgents requires session ($public_resp)"
  PASS=$((PASS+1))
else
  echo "❌ agents.listAgents expected 401/403 got $public_resp"
  FAIL=$((FAIL+1))
fi

rm -f "$COOKIE_JAR"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"
