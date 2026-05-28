#!/usr/bin/env bash
# Daily scheduled run for the doc-drift-agent.
# - Refreshes /home/openclaw/ai-labs to latest trunk.
# - Honors the 12h suppression rule (agent/suppression-policy.md).
# - Posts the spec-shaped Telegram notification per agent/notification-spec.md:
#     drift-found      → full report sent to chat
#     no-drift+manual  → short ack
#     no-drift+sched   → silent
#
# The bot token is read from ~/.openclaw/openclaw.json (mode 600) at runtime.
# Never inlined into this file.
#
# Deployed to: /home/openclaw/.openclaw/scripts/doc-drift-cron.sh (mode 700, owner openclaw).
set -uo pipefail

STATE_FILE=/home/openclaw/.openclaw/agents/doc-drift-agent/state.json
LOG_FILE=/home/openclaw/.openclaw/logs/doc-drift-cron.log
REPO_PATH=/home/openclaw/ai-labs
OPENCLAW_JSON=/home/openclaw/.openclaw/openclaw.json
CHAT_ID=54589373
TG_LIMIT=4000  # leave headroom under Telegram's 4096 char per-message limit

BOT_TOKEN=$(jq -r '.channels.telegram.accounts.docdrift.botToken // empty' "$OPENCLAW_JSON" 2>/dev/null)
if [[ -z "$BOT_TOKEN" ]]; then
  logger -t openclaw-doc-drift "ERROR: docdrift bot token missing in $OPENCLAW_JSON"
  exit 1
fi

tg() {
  local text="$1"
  curl -fsS -m 10 -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${CHAT_ID}" \
    --data-urlencode "text=${text}" \
    --data-urlencode "disable_web_page_preview=true" \
    -o /dev/null || true
}

now_iso=$(date -u +%FT%TZ)
last=$(jq -r '.last_manual_run_utc // ""' "$STATE_FILE" 2>/dev/null || echo "")
now_epoch=$(date -u +%s)

if [[ -n "$last" && "$last" != "null" ]]; then
  last_epoch=$(date -u -d "$last" +%s 2>/dev/null || echo "0")
  diff=$(( now_epoch - last_epoch ))
  if (( diff < 43200 )); then
    logger -t openclaw-doc-drift "scheduled run suppressed (diff=${diff}s < 43200s)"
    exit 0
  fi
fi

{
  echo "=== ${now_iso} refreshing ${REPO_PATH} ==="
  cd "$REPO_PATH"
  git fetch --quiet origin trunk
  git checkout --quiet trunk
  git pull --ff-only --quiet
  echo "head: $(git log --oneline -1)"
} >> "$LOG_FILE" 2>&1

logger -t openclaw-doc-drift "running scheduled drift check"

export PATH=/home/openclaw/.npm-global/bin:$PATH
output_file=$(mktemp)
trap 'rm -f "$output_file"' EXIT

openclaw agent --agent doc-drift-agent --message "/doc-drift-review --scheduled" > "$output_file" 2>&1
end_iso=$(date -u +%FT%TZ)

{ echo "=== ${now_iso} scheduled run starting ==="
  cat "$output_file"
  echo "=== ${end_iso} scheduled run completed ==="
} >> "$LOG_FILE" 2>&1

findings=$(grep -E "^- Findings: " "$output_file" | head -1 | grep -oE "[0-9]+" | head -1)
findings=${findings:-0}

if (( findings > 0 )); then
  body=$(head -c "$TG_LIMIT" "$output_file")
  if (( $(wc -c < "$output_file") > TG_LIMIT )); then
    body="${body}

…(truncated; full report at ${LOG_FILE} on VPS)"
  fi
  tg "$body"
else
  # Scheduled + 0 findings is silent per spec.
  :
fi
