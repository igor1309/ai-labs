#!/usr/bin/env bash
# Scheduled run for the maestro-flow-review-agent.
# - Refreshes /home/openclaw/ios.config to latest trunk.
# - Honors the 12h suppression rule (agent/suppression-policy.md).
# - Posts exactly one message per tick per agent/notification-spec.md (heartbeat model):
#     findings>0           → Findings message (PR opened/updated)
#     findings==0          → Heartbeat message ("✓ ran — 0 findings")  ← the liveness ping
#     suppressed           → Suppressed message (this wrapper posts it; agent not invoked)
#     invocation failed    → FAILED alert (non-zero exit OR no run summary)
#   The FAILED branch is fail-closed: if the model/auth is unavailable (codex OAuth
#   down, OpenRouter fallback also failing) the agent call errors or emits no summary,
#   and we must NOT silently post a clean heartbeat. Absence of any message at the
#   cron cadence means the cron/host itself failed.
#
# The bot token is read from ~/.openclaw/openclaw.json (mode 600) at runtime.
# Never inlined into this file.
#
# Deployed to: /home/openclaw/.openclaw/scripts/maestro-review-cron.sh (mode 700, owner openclaw).
# Notifications post via the shared `docdrift` bot (@igor1309_ai_labs_bot) into the
# #maestro-review topic (CHAT_ID=-1003954520541, THREAD_ID=2) of the ai-labs agents
# supergroup — no per-agent bot/account. The agent is invoked by id
# (`openclaw agent --agent maestro-flow-review-agent`); inbound triggering is via the
# supergroup topic's per-topic agentId, not a dedicated binding.
set -uo pipefail

STATE_FILE=/home/openclaw/.openclaw/agents/maestro-flow-review-agent/state.json
LOG_FILE=/home/openclaw/.openclaw/logs/maestro-review-cron.log
REPO_PATH=/home/openclaw/ios.config
OPENCLAW_JSON=/home/openclaw/.openclaw/openclaw.json
CHAT_ID=-1003954520541          # ai-labs agents supergroup
THREAD_ID=2                     # #maestro-review forum topic
TG_LIMIT=4000  # headroom under Telegram's 4096-char per-message limit

BOT_TOKEN=$(jq -r '.channels.telegram.accounts.docdrift.botToken // empty' "$OPENCLAW_JSON" 2>/dev/null)
if [[ -z "$BOT_TOKEN" ]]; then
  logger -t openclaw-maestro-review "ERROR: docdrift bot token missing in $OPENCLAW_JSON"
  exit 1
fi

tg() {
  local text="$1"
  curl -fsS -m 10 -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${CHAT_ID}" \
    --data-urlencode "message_thread_id=${THREAD_ID}" \
    --data-urlencode "text=${text}" \
    --data-urlencode "disable_web_page_preview=true" \
    -o /dev/null || true
}

now_iso=$(date -u +%FT%TZ)
now_human=$(date -u +'%Y-%m-%d %H:%M UTC')
now_epoch=$(date -u +%s)

# --- suppression gate (heartbeat: suppressed ticks still post) ---
last=$(jq -r '.last_manual_run_utc // ""' "$STATE_FILE" 2>/dev/null || echo "")
if [[ -n "$last" && "$last" != "null" ]]; then
  last_epoch=$(date -u -d "$last" +%s 2>/dev/null || echo "0")
  diff=$(( now_epoch - last_epoch ))
  if (( diff < 43200 )); then
    ago=$(printf '%dh %dm' $(( diff / 3600 )) $(( (diff % 3600) / 60 )))
    logger -t openclaw-maestro-review "scheduled run suppressed (diff=${diff}s < 43200s)"
    tg "[maestro-review] ⏸ suppressed — manual run ${ago} ago

Run: scheduled · ${now_human}"
    exit 0
  fi
fi

# --- refresh ios.config to latest trunk ---
{
  echo "=== ${now_iso} refreshing ${REPO_PATH} ==="
  cd "$REPO_PATH"
  git fetch --quiet origin trunk
  git checkout --quiet trunk
  git pull --ff-only --quiet
  echo "head: $(git log --oneline -1)"
} >> "$LOG_FILE" 2>&1

logger -t openclaw-maestro-review "running scheduled maestro flow review"

export PATH=/home/openclaw/.npm-global/bin:$PATH
output_file=$(mktemp)
trap 'rm -f "$output_file"' EXIT

openclaw agent --agent maestro-flow-review-agent --message "/maestro-review --scheduled" > "$output_file" 2>&1
rc=$?
end_iso=$(date -u +%FT%TZ)

{ echo "=== ${now_iso} scheduled run starting (rc=${rc}) ==="
  cat "$output_file"
  echo "=== ${end_iso} scheduled run completed ==="
} >> "$LOG_FILE" 2>&1

# --- fail-closed: a real run exits 0 AND emits the parseable run summary.
# A model/auth outage (codex OAuth invalid, OpenRouter fallback also down) makes the
# call error or print no summary; without this guard `findings` would default to 0 and
# we would post a FALSE "✓ ran — 0 findings" heartbeat. Alert instead.
if (( rc != 0 )) || ! grep -qE "^- Findings: " "$output_file"; then
  logger -t openclaw-maestro-review "ERROR: agent run failed (rc=${rc}, summary $(grep -qE '^- Findings: ' "$output_file" && echo present || echo missing))"
  tg "[maestro-review] ⚠ run FAILED — no valid result

Run: scheduled · ${now_human}
Exit: ${rc} · run summary: $(grep -qE '^- Findings: ' "$output_file" && echo present || echo missing)
Likely the model/auth was unavailable (codex OAuth or OpenRouter fallback). Check the gateway and OAuth.

$(tail -c 1200 "$output_file")"
  exit 1
fi

# --- parse the agent's run summary (agent/notification-spec.md) ---
field() { grep -E "^- $1: " "$output_file" | head -1 | sed -E "s/^- $1: //"; }
findings=$(field 'Findings'); findings=$(echo "${findings:-0}" | grep -oE '[0-9]+' | head -1); findings=${findings:-0}
crit=$(field 'Critical'); crit=$(echo "${crit:-0}" | grep -oE '[0-9]+' | head -1); crit=${crit:-0}
recs=$(field 'Recommendations'); recs=$(echo "${recs:-0}" | grep -oE '[0-9]+' | head -1); recs=${recs:-0}
minor=$(field 'Minor'); minor=$(echo "${minor:-0}" | grep -oE '[0-9]+' | head -1); minor=${minor:-0}
flows=$(field 'Flows reviewed'); flows=$(echo "${flows:-0}" | grep -oE '[0-9]+' | head -1); flows=${flows:-0}
commit=$(field 'Commit'); commit=${commit:-unknown}
pr=$(field 'PR'); pr=${pr:-none}

if (( findings > 0 )); then
  pr_line="PR: ${pr}"
  [[ "$pr" == "none" ]] && pr_line="PR: none — no Verified fix to apply (findings are Provisional; see review)"
  tg "[maestro-review] Findings — ${findings}

Run: scheduled · ${now_human}
ios.config: ${commit} on trunk

Critical: ${crit} · Recommendations: ${recs} · Minor: ${minor}
${pr_line}

Do not auto-merge. Review the PR manually."
else
  # Heartbeat: clean scheduled run still pings (this is the liveness signal).
  tg "[maestro-review] ✓ ran — 0 findings

Run: scheduled · ${now_human}
ios.config: ${commit} on trunk
Flows reviewed: ${flows}"
fi
