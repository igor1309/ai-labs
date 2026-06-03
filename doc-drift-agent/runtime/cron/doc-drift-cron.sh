#!/usr/bin/env bash
# Daily scheduled run for the doc-drift-agent.
# - Refreshes /home/openclaw/ai-labs to latest trunk.
# - Honors the 12h suppression rule (agent/suppression-policy.md).
# - Posts exactly one Telegram message per agent/notification-spec.md:
#     drift-found        → compact summary parsed from the report (NOT the raw report)
#     no-drift+scheduled → silent
#     run failed         → FAILED alert (non-zero exit OR no parseable report)
#   The no-drift+manual ack is the OpenClaw Telegram listener's job, not this
#   scheduled-only wrapper.
#
# Rendering (agent/notification-spec.md "Rendering"): the agent's run report is
# Markdown — `##` headers, a `| Finding | … |` table — and the `openclaw agent`
# invocation also emits plugin warnings and tool-call traces on stderr. Posting
# that file verbatim is the bug this wrapper used to have. We parse the report's
# `- Field: value` header lines + the Fix PRs table URLs and build a plain-text
# message; nothing else from the captured output reaches Telegram.
#
# The bot token is read from ~/.openclaw/openclaw.json (mode 600) at runtime.
# Never inlined into this file.
#
# Deployed to: /home/openclaw/.openclaw/scripts/doc-drift-cron.sh (mode 700, owner openclaw).
# Notifications post via the shared `ai-labs` account (@igor1309_ai_labs_bot) into the
# #doc-drift topic (CHAT_ID=-1003954520541, THREAD_ID=4) of the ai-labs agents
# supergroup — no per-agent bot/account.
set -uo pipefail

STATE_FILE=/home/openclaw/.openclaw/agents/doc-drift-agent/state.json
LOG_FILE=/home/openclaw/.openclaw/logs/doc-drift-cron.log
REPO_PATH=/home/openclaw/ai-labs
OPENCLAW_JSON=/home/openclaw/.openclaw/openclaw.json
CHAT_ID=-1003954520541          # ai-labs agents supergroup
THREAD_ID=4                     # #doc-drift forum topic

BOT_TOKEN=$(jq -r '.channels.telegram.accounts["ai-labs"].botToken // empty' "$OPENCLAW_JSON" 2>/dev/null)
if [[ -z "$BOT_TOKEN" ]]; then
  logger -t openclaw-doc-drift "ERROR: ai-labs bot token missing in $OPENCLAW_JSON"
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
rc=$?
end_iso=$(date -u +%FT%TZ)

{ echo "=== ${now_iso} scheduled run starting (rc=${rc}) ==="
  cat "$output_file"
  echo "=== ${end_iso} scheduled run completed ==="
} >> "$LOG_FILE" 2>&1

# --- fail-closed: a real run exits 0 AND emits the parseable report header.
# A model/auth outage or a crashed tool call makes the call error or print no
# report; without this guard `findings` would default to 0 and a failed run would
# be indistinguishable from a clean (silent) one. Alert instead — and post only a
# bounded tail, never the whole captured file.
if (( rc != 0 )) || ! grep -qE "^- Findings: " "$output_file"; then
  logger -t openclaw-doc-drift "ERROR: agent run failed (rc=${rc}, report $(grep -qE '^- Findings: ' "$output_file" && echo present || echo missing))"
  tg "[doc-drift] ⚠ run FAILED — no valid report

Run: scheduled · ${now_human}
Exit: ${rc} · report: $(grep -qE '^- Findings: ' "$output_file" && echo present || echo missing)
Likely the model/auth was unavailable or a tool crashed. Check the gateway and ${LOG_FILE} on VPS.

$(tail -c 1000 "$output_file")"
  exit 1
fi

# --- parse the report header (agent/report-format.md "Top-level structure") ---
field() { grep -E "^- $1: " "$output_file" | head -1 | sed -E "s/^- $1: //"; }
num() { echo "${1:-0}" | grep -oE '[0-9]+' | head -1; }

findings=$(num "$(field 'Findings')"); findings=${findings:-0}
opened=$(num "$(field 'Fix PRs opened')"); opened=${opened:-0}
tracked=$(num "$(field 'Already tracked')"); tracked=${tracked:-0}
inspected=$(num "$(field 'READMEs inspected')"); inspected=${inspected:-0}
commit=$(field 'Repo commit' | awk '{print $1}')  # short SHA (hex), e.g. "ca58286 (trunk)"
commit=${commit:-unknown}

if (( findings > 0 )); then
  # PR URLs in Fix PRs table order; deduped, preserving first occurrence.
  pr_urls=$(grep -oE 'https://github\.com/[^ |)]+/pull/[0-9]+' "$output_file" | awk '!seen[$0]++')
  if [[ -n "$pr_urls" ]]; then
    pr_block=$(echo "$pr_urls" | sed 's/^/- /')
  else
    pr_block="- (no PR opened — see report at ${LOG_FILE} on VPS)"
  fi
  tg "[doc-drift] Drift found — ${findings} finding(s)

Run: scheduled · ${now_human}
Commit: ${commit} on trunk
READMEs inspected: ${inspected}

PRs opened: ${opened} · already tracked: ${tracked}
${pr_block}

Do not auto-merge. Review each PR manually."
else
  # Scheduled + 0 findings is silent per spec.
  :
fi
