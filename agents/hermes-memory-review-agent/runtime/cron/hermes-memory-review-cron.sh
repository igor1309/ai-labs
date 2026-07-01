#!/usr/bin/env bash
# Cron wrapper for the hermes-memory-review-agent. One script, two entry modes:
#
#   --weekly  Sunday 06:00 UTC: LLM review of the latest Hermes snapshot.
#             Honors the 24h manual-run suppression gate (agent/suppression-policy.md),
#             invokes the agent, then delivers the report file (sendDocument) + a
#             compact summary, or a fail-closed alert. The agent commits+pushes the
#             report to the canonical repo; this wrapper only notifies.
#
#   --hourly  every hour at :20: deterministic memory-ping. Counts pending/memory
#             items not yet pinged (durable cursor in state.json last_ping) and posts
#             a count to the ping topic; silent when nothing new. NO LLM invocation.
#
# Both modes take a shared per-agent lock so the Sunday-06:00 edge and any
# manual/scheduled overlap resolve to a skip, never a concurrent run.
#
# Bot token is read from ~/.openclaw/openclaw.json (mode 600) at runtime — never
# inlined. Notifications post via the shared ai-labs agents bot into two forum
# topics (review, memory-ping).
#
# Deployed to: /home/openclaw/.openclaw/scripts/hermes-memory-review-cron.sh (700, openclaw).
# runtime/** is NOT CI-synced — redeploy by scp + chmod 700 after any edit here.
set -uo pipefail

# --- inventory-owned config (allocated at wiring; fill on the VPS before first run) ---
# These values are owned by the inventory repo per the ownership boundary. The
# placeholders MUST be replaced on the deployed copy; the wrapper refuses to run
# while any remain. See runtime/README.md.
CHAT_ID=__SET_AT_WIRING__            # ai-labs agents supergroup chat id
REVIEW_THREAD_ID=__SET_AT_WIRING__   # message_thread_id of the review topic
PING_THREAD_ID=__SET_AT_WIRING__     # message_thread_id of the memory-ping topic
SNAPSHOT_ROOT=__SET_AT_WIRING__      # dir holding dated Hermes snapshots (<root>/<YYYY-MM-DD>/)
PENDING_MEMORY_DIR=__SET_AT_WIRING__ # near-live Hermes pending/memory dir for the hourly ping
CANONICAL_REPO=__SET_AT_WIRING__     # checkout of the canonical skills repo (report commit target)
CANONICAL_BRANCH=__SET_AT_WIRING__   # target branch for report commits

# --- fixed paths ---
STATE_FILE=/home/openclaw/.openclaw/agents/hermes-memory-review-agent/state.json
LOG_FILE=/home/openclaw/.openclaw/logs/hermes-memory-review-cron.log
LOCK_FILE=/home/openclaw/.openclaw/agents/hermes-memory-review-agent/run.lock
OPENCLAW_JSON=/home/openclaw/.openclaw/openclaw.json

mode="${1:-}"
if [[ "$mode" != "--weekly" && "$mode" != "--hourly" ]]; then
  echo "usage: $0 --weekly|--hourly" >&2
  exit 2
fi

# Refuse to run with any unfilled placeholder (fail-closed on misconfiguration).
for v in CHAT_ID REVIEW_THREAD_ID PING_THREAD_ID SNAPSHOT_ROOT PENDING_MEMORY_DIR CANONICAL_REPO CANONICAL_BRANCH; do
  if [[ "${!v}" == "__SET_AT_WIRING__" ]]; then
    logger -t openclaw-hermes-review "ERROR: ${v} is an unfilled placeholder; refusing to run"
    exit 1
  fi
done

BOT_TOKEN=$(jq -r '.channels.telegram.accounts["ai-labs"].botToken // empty' "$OPENCLAW_JSON" 2>/dev/null)
if [[ -z "$BOT_TOKEN" ]]; then
  logger -t openclaw-hermes-review "ERROR: ai-labs bot token missing in $OPENCLAW_JSON"
  exit 1
fi

now_human=$(date -u +'%Y-%m-%d %H:%M UTC')
now_iso=$(date -u +%FT%TZ)

# tg <thread_id> <text> — plain-text sendMessage, swallow delivery failures.
tg() {
  local thread="$1" text="$2"
  curl -fsS -m 10 -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${CHAT_ID}" \
    --data-urlencode "message_thread_id=${thread}" \
    --data-urlencode "text=${text}" \
    --data-urlencode "disable_web_page_preview=true" \
    -o /dev/null || true
}

# tg_doc <thread_id> <file> <caption> — sendDocument into a forum topic. One retry.
# Returns 0 on ok:true, 1 otherwise.
tg_doc() {
  local thread="$1" file="$2" caption="$3" resp
  for _ in 1 2; do
    resp=$(curl -fsS -m 30 -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendDocument" \
      -F "chat_id=${CHAT_ID}" \
      -F "message_thread_id=${thread}" \
      -F "caption=${caption}" \
      -F "document=@${file}" 2>/dev/null)
    [[ "$(jq -r '.ok // false' <<<"$resp" 2>/dev/null)" == "true" ]] && return 0
  done
  return 1
}

# Shared lock: if held, skip (a concurrent run is already active).
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  logger -t openclaw-hermes-review "skipped: locked (${mode})"
  exit 0
fi

# ----------------------------------------------------------------------------
if [[ "$mode" == "--hourly" ]]; then
  # Deterministic ping: current pending/memory ids vs the durable cursor.
  if [[ ! -d "$PENDING_MEMORY_DIR" ]]; then
    logger -t openclaw-hermes-review "hourly: pending dir $PENDING_MEMORY_DIR absent"
    tg "$PING_THREAD_ID" "[hermes-review] ⚠ ping run FAILED

When: ${now_human}
Exit: 1 · pending/memory dir absent
Check the gateway and ${LOG_FILE} on VPS."
    exit 1
  fi

  current=$(cd "$PENDING_MEMORY_DIR" && ls -1 2>/dev/null | grep -E '\.json$' | sed 's/\.json$//' | sort || true)
  seen=$(jq -r '.last_ping.ids[]? // empty' "$STATE_FILE" 2>/dev/null | sort || true)
  new=$(comm -23 <(printf '%s\n' "$current" | sed '/^$/d') <(printf '%s\n' "$seen" | sed '/^$/d'))
  new_count=$(printf '%s\n' "$new" | sed '/^$/d' | wc -l | tr -d ' ')

  if (( new_count > 0 )); then
    if tg "$PING_THREAD_ID" "[hermes-review] ${new_count} memory update(s) staged

Since the last ping. Review/apply before they age into the weekly cycle." ; then
      : # tg swallows failures; treat as delivered and advance the cursor.
    fi
    # Advance cursor to the current id set, preserving last_manual_run_utc.
    ids_json=$(printf '%s\n' "$current" | sed '/^$/d' | jq -R . | jq -s .)
    tmp=$(mktemp)
    jq --argjson ids "$ids_json" --arg utc "$now_iso" \
      '(. // {}) | .last_ping = {ids: $ids, utc: $utc}' \
      "$STATE_FILE" 2>/dev/null > "$tmp" || echo "{\"last_ping\":{\"ids\":${ids_json},\"utc\":\"${now_iso}\"}}" > "$tmp"
    mv "$tmp" "$STATE_FILE"
    logger -t openclaw-hermes-review "hourly: pinged ${new_count} new, cursor advanced"
  else
    logger -t openclaw-hermes-review "hourly: nothing new (silent)"
  fi
  exit 0
fi

# ----------------------------------------------------------------------------
# --weekly
# Suppression gate: skip if a manual run finished < 24h ago.
last=$(jq -r '.last_manual_run_utc // ""' "$STATE_FILE" 2>/dev/null || echo "")
if [[ -n "$last" && "$last" != "null" ]]; then
  last_epoch=$(date -u -d "$last" +%s 2>/dev/null || echo 0)
  now_epoch=$(date -u +%s)
  diff=$(( now_epoch - last_epoch ))
  if (( diff < 86400 )); then
    logger -t openclaw-hermes-review "weekly run suppressed (diff=${diff}s < 86400s)"
    exit 0
  fi
fi

# Freshen the canonical checkout so the agent commits onto current head.
{
  echo "=== ${now_iso} refreshing ${CANONICAL_REPO} (${CANONICAL_BRANCH}) ==="
  cd "$CANONICAL_REPO"
  git fetch --quiet origin "$CANONICAL_BRANCH"
  git checkout --quiet "$CANONICAL_BRANCH"
  git pull --ff-only --quiet
  echo "head: $(git log --oneline -1)"
} >> "$LOG_FILE" 2>&1

# Pick the latest dated snapshot.
snapshot_dir=$(ls -1d "${SNAPSHOT_ROOT%/}"/*/ 2>/dev/null | sort | tail -1)
snapshot_dir=${snapshot_dir%/}
if [[ -z "$snapshot_dir" || ! -d "$snapshot_dir" ]]; then
  logger -t openclaw-hermes-review "weekly: no snapshot under ${SNAPSHOT_ROOT}"
  tg "$REVIEW_THREAD_ID" "[hermes-review] ⚠ weekly run FAILED

When: ${now_human}
Exit: 1 · no dated snapshot under ${SNAPSHOT_ROOT}
Check the gateway and ${LOG_FILE} on VPS."
  exit 1
fi

logger -t openclaw-hermes-review "running weekly review on ${snapshot_dir}"
export PATH=/home/openclaw/.npm-global/bin:$PATH
output_file=$(mktemp)
trap 'rm -f "$output_file"' EXIT

openclaw agent --agent hermes-memory-review-agent \
  --message "/hermes-memory-review --scheduled --snapshot ${snapshot_dir}" > "$output_file" 2>&1
rc=$?
end_iso=$(date -u +%FT%TZ)

{ echo "=== ${now_iso} weekly run starting (rc=${rc}) on ${snapshot_dir} ==="
  cat "$output_file"
  echo "=== ${end_iso} weekly run completed ==="
} >> "$LOG_FILE" 2>&1

# Parse the run-result (agent.md step 7). Fail-closed: a real run exits 0 AND
# emits a parseable "- Status: " line.
field() { grep -E "^- $1: " "$output_file" | head -1 | sed -E "s/^- $1: //"; }
status=$(field 'Status')

if (( rc != 0 )) || [[ -z "$status" ]]; then
  logger -t openclaw-hermes-review "ERROR: weekly run failed (rc=${rc}, status='${status}')"
  tg "$REVIEW_THREAD_ID" "[hermes-review] ⚠ weekly run FAILED

When: ${now_human}
Exit: ${rc} · $( [[ -z "$status" ]] && echo 'no parseable run-result' || echo "status=${status}" )
Check the gateway and ${LOG_FILE} on VPS.

$(tail -c 1000 "$output_file")"
  exit 1
fi

if [[ "$status" == "failed" ]]; then
  err=$(field 'Error')
  logger -t openclaw-hermes-review "weekly run reported failed: ${err}"
  tg "$REVIEW_THREAD_ID" "[hermes-review] ⚠ weekly run FAILED

When: ${now_human}
Exit: 0 · ${err:-agent reported failure}
Check the gateway and ${LOG_FILE} on VPS."
  exit 1
fi

report_rel=$(field 'Report path')
commit=$(field 'Commit')
findings=$(field 'Findings'); findings=$(echo "${findings:-0}" | grep -oE '[0-9]+' | head -1); findings=${findings:-0}
snap_date=$(basename "$snapshot_dir")

if [[ "$status" == "no-op" ]]; then
  tg "$REVIEW_THREAD_ID" "[hermes-review] Weekly review — ${snap_date} (no change)

Findings: ${findings}
Commit: none (no change)

Report unchanged from last run. Proposes only — review and promote by hand."
  logger -t openclaw-hermes-review "weekly: no-op for ${snap_date}"
  exit 0
fi

# status == ok: deliver the report file, then the compact summary.
report_abs="${CANONICAL_REPO%/}/${report_rel}"
if [[ -f "$report_abs" ]] && tg_doc "$REVIEW_THREAD_ID" "$report_abs" "[hermes-review] ${snap_date} review"; then
  :
else
  logger -t openclaw-hermes-review "weekly: sendDocument failed or report missing (${report_abs})"
fi
tg "$REVIEW_THREAD_ID" "[hermes-review] Weekly review — ${snap_date}

Findings: ${findings}
Commit: ${commit:-unknown} on ${CANONICAL_BRANCH}

Report attached above. Proposes only — review and promote by hand."
logger -t openclaw-hermes-review "weekly: delivered review for ${snap_date} (${findings} findings)"
exit 0
