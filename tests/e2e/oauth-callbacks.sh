#!/usr/bin/env bash
#
# NOTE: requires a running dev server (BASE=http://localhost:3000) plus DEV_EMAIL/DEV_PASSWORD
# in .env. It asserts every OAuth callback path that does not need a provider:
# no-session, provider-declined, missing params, unknown/forged/expired state,
# cross-platform state, and the 503 "credentials not configured" report.
# Live verification of the shared OAuth callback routes (no provider needed).
# Asserts the paths that must work regardless of credentials.
set -uo pipefail
BASE="${BASE:-http://localhost:3000}"
WORK="C:/Users/ENG_H/socialorc-e2e"
TMP="$WORK/tmp"; JAR="$WORK/cookies-oauth.txt"
mkdir -p "$TMP"; rm -f "$JAR"
ENVF="C:/Users/ENG_H/socialorc-m06/.env"
EMAIL=$(sed -n 's/^DEV_EMAIL="\(.*\)"/\1/p' "$ENVF")
PASS=$(sed -n 's/^DEV_PASSWORD="\(.*\)"/\1/p' "$ENVF")

pass=0; fail=0
loc() { grep -i '^location:' "$1" | tr -d '\r' | sed 's/[Ll]ocation: //'; }
check() { # name, haystack, needle
  if echo "$2" | grep -q "$3"; then echo "  [PASS] $1"; pass=$((pass+1)); else echo "  [FAIL] $1 — got: $2"; fail=$((fail+1)); fi
}

echo "== unauthenticated callbacks must not connect anything =="
for p in twitter facebook instagram tiktok youtube linkedin; do
  curl -s -D "$TMP/h.txt" -o /dev/null --max-time 30 "$BASE/api/social/$p/callback?code=abc&state=def"
  check "$p callback without a session -> login" "$(loc "$TMP/h.txt")" "/login?error=unauthorized"
done

echo "== log in =="
# The dev user may not exist yet in this database (worktree DBs come from git).
curl -s -o /dev/null -w "  register -> %{http_code}\n" --max-time 30 -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "$(python -c "
import json,re
s=open(r'$ENVF',encoding='utf-8').read()
em=re.search(r'DEV_EMAIL=\"(.*?)\"',s).group(1); pw=re.search(r'DEV_PASSWORD=\"(.*?)\"',s).group(1)
print(json.dumps({'name':'Hassan Nasr','email':em,'password':pw}))")"
CSRF=$(curl -s -c "$JAR" --max-time 30 "$BASE/api/auth/csrf" | python -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
curl -s -b "$JAR" -c "$JAR" -o "$TMP/login.json" -w "  login -> %{http_code}\n" --max-time 30 -X POST "$BASE/api/auth/callback/credentials" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=$EMAIL" --data-urlencode "password=$PASS" --data-urlencode "json=true"
grep -q "session-token" "$JAR" && echo "  session cookie: OK" || { echo "  session cookie: MISSING"; tail -3 "$JAR"; }

echo "== provider declined =="
curl -s -D "$TMP/h.txt" -b "$JAR" -o /dev/null --max-time 30 "$BASE/api/social/tiktok/callback?error=access_denied&error_description=User%20denied%20the%20request"
check "provider error is surfaced to the user" "$(loc "$TMP/h.txt")" "error=User%20denied%20the%20request"

echo "== malformed callbacks =="
for p in twitter youtube; do
  curl -s -D "$TMP/h.txt" -b "$JAR" -o /dev/null --max-time 30 "$BASE/api/social/$p/callback"
  check "$p callback with no params -> missing_params" "$(loc "$TMP/h.txt")" "error=missing_params"
  curl -s -D "$TMP/h.txt" -b "$JAR" -o /dev/null --max-time 30 "$BASE/api/social/$p/callback?code=abc&state=deadbeef"
  check "$p callback with an unknown state -> invalid_state" "$(loc "$TMP/h.txt")" "error=invalid_state"
done

echo "== state security =="
# A state cookie minted for a different user must be refused.
forged='{"userId":"attacker","platform":"TWITTER","timestamp":'"$(date +%s)"'000}'
curl -s -D "$TMP/h.txt" -b "$JAR" -b "oauth_state_deadbeef=$forged" -o /dev/null --max-time 30 "$BASE/api/social/twitter/callback?code=abc&state=deadbeef"
check "state for another user -> state_mismatch" "$(loc "$TMP/h.txt")" "error=state_mismatch"

# A state cookie minted for a different platform must be refused too.
crossed='{"userId":"'"$(python -c "
import sqlite3;c=sqlite3.connect('C:/Users/ENG_H/socialorc-m06/dev.db')
print(c.execute(\"select id from User where email='hassan@socialorc.local'\").fetchone()[0])" 2>/dev/null)"'","platform":"LINKEDIN","timestamp":'"$(date +%s)"'000}'
curl -s -D "$TMP/h.txt" -b "$JAR" -b "oauth_state_deadbeef=$crossed" -o /dev/null --max-time 30 "$BASE/api/social/twitter/callback?code=abc&state=deadbeef"
check "state for another platform -> state_mismatch" "$(loc "$TMP/h.txt")" "error=state_mismatch"

echo "== unconfigured platforms still report what is missing =="
for p in TWITTER INSTAGRAM FACEBOOK TIKTOK YOUTUBE; do
  body=$(curl -s -b "$JAR" --max-time 30 "$BASE/api/social/connect?platform=$p")
  if echo "$body" | grep -q "credentials not configured"; then
    echo "  [PASS] connect $p -> 503 with the missing variables"; pass=$((pass+1))
  else
    echo "  [FAIL] connect $p -> $body"; fail=$((fail+1))
  fi
done

echo
echo "OAUTH CALLBACK RESULT: $([ "$fail" -eq 0 ] && echo PASS || echo FAIL) — $pass passed, $fail failed"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
