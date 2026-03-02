#!/bin/bash
#
# SessionStart Hook — session-reorient.sh
#
# Fires on compact, startup, and resume events.
# - compact: clears nudge state, injects re-orientation instructions
# - startup: light identity reminder
# - resume: cleans stale nudge files older than 24h
#
# stdout is injected into Claude's context as a system message.
#
# No island-specific paths — works for any agent on any island.

set -euo pipefail

INPUT=$(cat)
SOURCE=$(echo "$INPUT" | jq -r '.source // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

STATE_DIR="${CWD}/tasks/.context-state"

case "$SOURCE" in
  compact)
    # Clear the nudge state so the cycle can repeat in the new context
    if [ -n "$SESSION_ID" ] && [ -f "${STATE_DIR}/${SESSION_ID}.nudged" ]; then
      rm -f "${STATE_DIR}/${SESSION_ID}.nudged"
    fi

    echo "--- Context was just compacted. Re-orient yourself: ---"
    echo ""
    echo "1. Read your HANDOFF.md — this is your most recent state"
    echo "2. Read your memory files (MEMORY.md) for stable context"
    echo "3. If you have a pocket notebook, run \`recent\` to see what was written lately"
    echo "4. Check shared surfaces (whiteboard, correspondence inbox) for anything new"
    echo ""
    echo "You were working before this compaction. Your pre-compaction self should have"
    echo "saved working state. Find it and pick up where you left off."
    echo ""
    echo "Do NOT ask the user what you were doing — the answer is in your files."
    ;;

  startup)
    echo "Session start. Your identity file and memory are loaded."
    ;;

  resume)
    # Clean stale nudge files older than 24h
    if [ -d "$STATE_DIR" ]; then
      find "$STATE_DIR" -name "*.nudged" -mtime +1 -delete 2>/dev/null || true
    fi
    echo "Session resumed. Your previous context is intact."
    ;;

  *)
    exit 0
    ;;
esac

exit 0
