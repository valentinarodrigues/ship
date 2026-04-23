#!/bin/bash
# Usage: ./test.sh [commit|validate|changelog|branch]
# Runs against localhost:3000 in MOCK_MODE by default.
# For real Copilot API: TOKEN=<your-token> ./test.sh

BASE_URL="${BASE_URL:-http://localhost:3000}"
TOKEN="${TOKEN:-mock-token}"

send() {
  local label="$1"
  local message="$2"
  echo ""
  echo "── $label ─────────────────────────────────────"
  curl -sN "$BASE_URL" \
    -H "Content-Type: application/json" \
    -H "x-github-token: $TOKEN" \
    -d "{\"messages\":[{\"role\":\"user\",\"content\":\"$message\"}]}" \
    | grep "^data:" \
    | grep -v "\[DONE\]" \
    | sed 's/^data: //' \
    | node -e "
        const chunks = [];
        require('readline').createInterface({ input: process.stdin })
          .on('line', l => { try { const c = JSON.parse(l)?.choices?.[0]?.delta?.content; if (c) chunks.push(c); } catch {} })
          .on('close', () => process.stdout.write(chunks.join('')));
      "
  echo ""
}

INTENT="${1:-all}"

case "$INTENT" in
  commit)
    send "Generate commit" "generate a commit message for: added rate limiting to the auth API endpoints" ;;
  validate)
    send "Validate title" "validate this PR title: Add OAuth login" ;;
  changelog)
    send "Changelog" "generate a changelog from: abc1234 feat(api): add pagination, def5678 fix(auth): token expiry, ghi9012 chore: bump dependencies" ;;
  branch)
    send "Branch name" "suggest a branch name for fixing the payment timeout bug" ;;
  all)
    send "Generate commit"  "generate a commit message for: added rate limiting to the auth API endpoints"
    send "Validate title"   "validate this PR title: Add OAuth login"
    send "Changelog"        "generate a changelog from: abc1234 feat(api): add pagination, def5678 fix(auth): token expiry"
    send "Branch name"      "suggest a branch name for fixing the payment timeout bug"
    ;;
  *)
    echo "Usage: $0 [commit|validate|changelog|branch|all]"
    exit 1 ;;
esac
