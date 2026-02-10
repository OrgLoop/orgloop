#!/usr/bin/env bash
#
# OrgLoop Claude Code Post-Exit Hook
#
# Install this as Claude Code's post-exit hook to notify OrgLoop
# when a Claude Code session completes.
#
# Installation:
#   1. Copy this script to a permanent location (e.g., ~/.orgloop/hooks/claude-code-exit.sh)
#   2. Make it executable: chmod +x claude-code-exit.sh
#   3. Configure Claude Code to use it as a post-exit hook
#
# Environment variables:
#   ORGLOOP_WEBHOOK_URL - The OrgLoop webhook endpoint (default: http://127.0.0.1:4400/webhook/claude-code)
#
# The script receives session data via environment variables set by Claude Code:
#   CLAUDE_SESSION_ID     - Unique session identifier
#   CLAUDE_WORKING_DIR    - Working directory of the session
#   CLAUDE_DURATION       - Session duration in seconds
#   CLAUDE_EXIT_STATUS    - Exit status code
#   CLAUDE_SUMMARY        - Session summary text

set -euo pipefail

WEBHOOK_URL="${ORGLOOP_WEBHOOK_URL:-http://127.0.0.1:4400/webhook/claude-code}"

SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"
WORKING_DIR="${CLAUDE_WORKING_DIR:-$(pwd)}"
DURATION="${CLAUDE_DURATION:-0}"
EXIT_STATUS="${CLAUDE_EXIT_STATUS:-0}"
SUMMARY="${CLAUDE_SUMMARY:-}"

PAYLOAD=$(cat <<EOF
{
  "session_id": "${SESSION_ID}",
  "working_directory": "${WORKING_DIR}",
  "duration_seconds": ${DURATION},
  "exit_status": ${EXIT_STATUS},
  "summary": $(printf '%s' "${SUMMARY}" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo '""')
}
EOF
)

# Send to OrgLoop — fire and forget, don't block Claude Code exit
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}" \
  "${WEBHOOK_URL}" \
  --connect-timeout 5 \
  --max-time 10 \
  >/dev/null 2>&1 || true
