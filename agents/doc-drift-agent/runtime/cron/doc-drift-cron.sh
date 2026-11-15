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

fail_run() {
  logger -t openclaw-doc-drift "ERROR: $1"
  printf '%s ERROR: %s\n' "$now_iso" "$1" >> "$LOG_FILE"
  tg "[doc-drift] ⚠ run FAILED — $1

Run: scheduled · ${now_human}
See ${LOG_FILE} on VPS."
  exit 1
}

# Never stash, reset or clean the shared checkout. Refuse staged, unstaged and
# untracked changes before switching branches; any refresh failure stops the run.
refresh_source() {
  local status
  cd "$REPO_PATH" || return 1
  status=$(git status --porcelain --untracked-files=all) || return 1
  if [[ -n "$status" ]]; then
    echo "source refresh refused: checkout has local changes; preserved unchanged"
    return 1
  fi
  git fetch --quiet origin trunk || return 1
  git checkout --quiet trunk || return 1
  git merge --ff-only --quiet origin/trunk || return 1
  printf 'head: '
  git log --oneline -1
}
if ! refresh_source >> "$LOG_FILE" 2>&1; then
  fail_run "source refresh failed; agent not started"
fi

# Keep the existing 900 MB limit; an unreadable sample is not safe headroom.
read_swap() {
  local sample
  sample=$(free -m) || return 1
  awk '/^Swap:/ && $3 ~ /^[0-9]+$/ {print $3; found=1}
       END {if (!found) exit 1}' <<< "$sample"
}
_sw=$(read_swap) || fail_run "swap check failed; agent not started"
if (( _sw > 900 )); then
  fail_run "SWAP-GUARD swap=${_sw}M > 900; agent not started"
fi

logger -t openclaw-doc-drift "running scheduled drift check"
export PATH=/home/openclaw/.npm-global/bin:$PATH
run_dir=$(mktemp -d) || fail_run "cannot create run directory"
output_file="$run_dir/output"
guard_reason="$run_dir/guard-reason"
_guard=""
cleanup() {
  if [[ -n "$_guard" ]]; then
    kill "$_guard" 2>/dev/null || true
    wait "$_guard" 2>/dev/null || true
  fi
  rm -rf -- "$run_dir"
}
trap cleanup EXIT

# --local runs the agent EMBEDDED (one-shot, on the existing Codex OAuth — no API key)
# instead of via the gateway, whose execution path spawns a Codex openclaw-hooks swarm on
# heavy reviews that swap-thrashes this 2.4 GB host. The embedded path does not.
# Why + verification numbers: vps/OpenClaw/gotchas.md #28 (RESOLVED 2026-06-30).
# --timeout 1200 covers the heaviest pass (the full README pass nears the 600 s default).
# Swap-guard: kill the embedded run if swap exceeds 900 MB — cheap insurance; --local does
# not swarm, but swap exhaustion is the failure mode that started all this.
# --session-key: a new session per run. A reused session carried a Codex thread whose
# last turn ran on gpt-5.5; after that model's retirement every pre-turn compaction asked
# for gpt-5.5 and failed (400), so the run never reached the model (2026-10-15..22).
( for _g in $(seq 1 420); do
    reason=""
    if ! _sw=$(read_swap); then
      reason="SWAP-GUARD swap check failed"
    elif (( _sw > 900 )); then
      reason="SWAP-GUARD swap=${_sw}M > 900"
    fi
    if [[ -n "$reason" ]]; then
      printf '%s\n' "$reason" > "$guard_reason"
      logger -t openclaw-doc-drift "$reason -> killing embedded run"
      pkill -f "agent --local.*doc-drift-agent"
      break
    fi
    sleep 3
  done ) &
_guard=$!
openclaw agent --local --agent doc-drift-agent --session-key "scheduled-$(date -u +%Y%m%dT%H%M%SZ)" --timeout 1200 --message "/doc-drift-review --scheduled" > "$output_file" 2>&1
rc=$?
kill "$_guard" 2>/dev/null || true
wait "$_guard" 2>/dev/null || true
_guard=""
if [[ -s "$guard_reason" ]]; then
  cat "$guard_reason" >> "$LOG_FILE"
  fail_run "$(cat "$guard_reason"); agent run aborted"
fi
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
# Degraded success: the agent sometimes replies with the compact Telegram message
# instead of the report (2026-10-23, 11-09, 11-15). If it exited 0 and that message
# names PR URLs, forward it as drift (marked) rather than raising a false FAILED.
if (( rc == 0 )) && ! grep -qE "^- Findings: " "$output_file" \
   && grep -qE '^\[doc-drift\] Drift found' "$output_file" \
   && grep -qE 'https://github\.com/[^ |)]+/pull/[0-9]+' "$output_file"; then
  logger -t openclaw-doc-drift "WARN: report missing; agent replied in notification format"
  tg "$(sed -n '/^\[doc-drift\] Drift found/,/^Do not auto-merge/p' "$output_file" | head -c 3000)

(report format missing — agent replied in notification format; details in ${LOG_FILE} on VPS)"
  exit 0
fi

if (( rc != 0 )) || ! grep -qE "^- Findings: " "$output_file"; then
  logger -t openclaw-doc-drift "ERROR: agent run failed (rc=${rc}, report $(grep -qE '^- Findings: ' "$output_file" && echo present || echo missing))"
  tg "[doc-drift] ⚠ run FAILED — no valid report

Run: scheduled · ${now_human}
Exit: ${rc} · report: $(grep -qE '^- Findings: ' "$output_file" && echo present || echo missing)
Check agent output in ${LOG_FILE} on VPS for the failure cause.

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
