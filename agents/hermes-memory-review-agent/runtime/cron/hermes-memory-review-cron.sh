#!/usr/bin/env bash
# Cron wrapper for the hermes-memory-review-agent. One script, two entry modes:
#
#   --weekly  Sunday 06:00 UTC: LLM review of the latest Hermes snapshot.
#             Honors the 24h manual-run suppression gate (agent/suppression-policy.md),
#             fail-closed refreshes the canonical checkout, invokes the agent, then
#             delivers the report file (sendDocument) + a compact summary, or a
#             fail-closed alert. The agent commits+pushes the report; this wrapper
#             notifies and validates the structured run-result.
#
#   --hourly  every hour at :20: deterministic memory-ping. Validates each
#             pending/memory/*.json, counts ids not yet pinged (durable cursor in
#             state.json last_ping), posts a count to the ping topic, and advances
#             the cursor ONLY after a delivered ping (or prunes deletions on an
#             empty scan). Silent when nothing new. NO LLM invocation.
#
# Both modes take a shared per-agent lock so the Sunday-06:00 edge and any
# manual/scheduled overlap resolve to a skip, never a concurrent run. The manual
# agent path takes the SAME lock for its state write (agent/agent.md step 8).
#
# Bot token is read from ~/.openclaw/openclaw.json (mode 600) at runtime — never
# inlined. Notifications post via the shared ai-labs agents bot into two forum
# topics (review, memory-ping).
#
# Deployed to: /home/openclaw/.openclaw/scripts/hermes-memory-review-cron.sh (700, openclaw).
# runtime/** is NOT CI-synced — redeploy by scp + chmod 700 after any edit here.
set -uo pipefail

# --- inventory-owned config (allocated at wiring; fill on the VPS before first run) ---
# Owned by the inventory repo per the ownership boundary. The placeholders MUST be
# replaced on the deployed copy; the wrapper refuses to run while any remain.
CHAT_ID=__SET_AT_WIRING__            # ai-labs agents supergroup chat id
REVIEW_THREAD_ID=__SET_AT_WIRING__   # message_thread_id of the review topic (1 => General; omitted on send)
PING_THREAD_ID=__SET_AT_WIRING__     # message_thread_id of the memory-ping topic (1 => General; omitted on send)
SNAPSHOT_ROOT=__SET_AT_WIRING__      # dir holding dated Hermes snapshots (<root>/<YYYY-MM-DD>/)
PENDING_MEMORY_DIR=__SET_AT_WIRING__ # near-live Hermes pending/memory dir for the hourly ping
CANONICAL_REPO=__SET_AT_WIRING__     # checkout of the canonical skills repo (report commit target)
CANONICAL_BRANCH=__SET_AT_WIRING__   # target branch for report commits

# --- fixed paths ---
STATE_DIR=/home/openclaw/.openclaw/agents/hermes-memory-review-agent
STATE_FILE="$STATE_DIR/state.json"
LOCK_FILE="$STATE_DIR/run.lock"
LOG_FILE=/home/openclaw/.openclaw/logs/hermes-memory-review-cron.log
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

mkdir -p "$STATE_DIR" 2>/dev/null || true

BOT_TOKEN=$(jq -r '.channels.telegram.accounts["ai-labs"].botToken // empty' "$OPENCLAW_JSON" 2>/dev/null)
if [[ -z "$BOT_TOKEN" ]]; then
  logger -t openclaw-hermes-review "ERROR: ai-labs bot token missing in $OPENCLAW_JSON"
  exit 1
fi

now_human=$(date -u +'%Y-%m-%d %H:%M UTC')
now_iso=$(date -u +%FT%TZ)

# tg <thread_id> <text> — plain-text sendMessage. Returns 0 iff Telegram ok:true.
# Omits message_thread_id for the General topic (thread 1), which Telegram rejects.
tg() {
  local thread="$1" text="$2" resp
  local args=(--data-urlencode "chat_id=${CHAT_ID}"
              --data-urlencode "text=${text}"
              --data-urlencode "disable_web_page_preview=true")
  [[ "$thread" != "1" ]] && args+=(--data-urlencode "message_thread_id=${thread}")
  resp=$(curl -sS -m 10 -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" "${args[@]}" 2>/dev/null)
  [[ "$(jq -r '.ok // false' <<<"$resp" 2>/dev/null)" == "true" ]]
}

# tg_doc <thread_id> <file> <caption> — sendDocument into a topic. One retry.
# Returns 0 iff Telegram ok:true.
tg_doc() {
  local thread="$1" file="$2" caption="$3" resp
  local args=(-F "chat_id=${CHAT_ID}" -F "caption=${caption}" -F "document=@${file}")
  [[ "$thread" != "1" ]] && args+=(-F "message_thread_id=${thread}")
  for _ in 1 2; do
    resp=$(curl -sS -m 30 -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendDocument" "${args[@]}" 2>/dev/null)
    [[ "$(jq -r '.ok // false' <<<"$resp" 2>/dev/null)" == "true" ]] && return 0
  done
  return 1
}

# write_state <jq-filter> [jq args...] — atomic single-writer merge into STATE_FILE.
# Validates the existing file parses (missing => {}), writes to a temp file in the
# SAME dir, and only mv's on success. Returns nonzero on any failure. Callers must
# treat a nonzero return as fatal, never log success without checking it.
write_state() {
  local filter="$1"; shift
  local cur tmp
  cur=$(cat "$STATE_FILE" 2>/dev/null || true)
  [[ -z "$cur" ]] && cur='{}'
  jq -e . >/dev/null 2>&1 <<<"$cur" || return 1        # malformed existing state => fail
  tmp=$(mktemp "${STATE_DIR}/.state.XXXXXX") || return 1
  if ! jq "$@" "$filter" <<<"$cur" > "$tmp" 2>/dev/null; then rm -f "$tmp"; return 1; fi
  chmod 600 "$tmp" 2>/dev/null || true
  mv "$tmp" "$STATE_FILE" || { rm -f "$tmp"; return 1; }
  return 0
}

# alert_exit <thread> <label> <rc> <reason> [tail] — best-effort fail-closed alert.
alert_exit() {
  local thread="$1" label="$2" rc="$3" reason="$4" tail="${5:-}"
  logger -t openclaw-hermes-review "ERROR: ${label} run FAILED (rc=${rc}): ${reason}"
  tg "$thread" "[hermes-review] ⚠ ${label} run FAILED

When: ${now_human}
Exit: ${rc} · ${reason}
Check the gateway and ${LOG_FILE} on VPS.${tail:+

${tail}}" || true
  exit 1
}
fail_weekly() { alert_exit "$REVIEW_THREAD_ID" "weekly" "${2:-1}" "$1" "${3:-}"; }
fail_ping()   { alert_exit "$PING_THREAD_ID" "ping" "${2:-1}" "$1" "${3:-}"; }

# Shared lock: if held, skip (a concurrent run — cron or a manual agent state
# write — is already active). No side effects on the locked path.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  logger -t openclaw-hermes-review "skipped: locked (${mode}) — no side effects"
  exit 0
fi

# ----------------------------------------------------------------------------
if [[ "$mode" == "--hourly" ]]; then
  [[ -d "$PENDING_MEMORY_DIR" ]] || fail_ping "pending/memory dir absent: ${PENDING_MEMORY_DIR}"

  # Validate every pending/memory/*.json before counting anything (fail-closed).
  current=""
  shopt -s nullglob
  for f in "$PENDING_MEMORY_DIR"/*.json; do
    [[ -f "$f" ]] || continue
    jq -e . "$f" >/dev/null 2>&1 || fail_ping "malformed pending JSON: $(basename "$f")"
    current+="$(basename "$f" .json)"$'\n'
  done
  shopt -u nullglob
  current=$(printf '%s' "$current" | sed '/^$/d' | sort)

  seen=$(jq -r '.last_ping.ids[]? // empty' "$STATE_FILE" 2>/dev/null | sort || true)
  new=$(comm -23 <(printf '%s\n' "$current" | sed '/^$/d') <(printf '%s\n' "$seen" | sed '/^$/d'))
  removed=$(comm -13 <(printf '%s\n' "$current" | sed '/^$/d') <(printf '%s\n' "$seen" | sed '/^$/d'))
  new_count=$(printf '%s\n' "$new" | sed '/^$/d' | wc -l | tr -d ' ')
  ids_json=$(printf '%s\n' "$current" | sed '/^$/d' | jq -R . | jq -s .)

  if (( new_count > 0 )); then
    # Deliver first; advance the cursor ONLY on delivered ping (rule 10 / T15).
    tg "$PING_THREAD_ID" "[hermes-review] ${new_count} memory update(s) staged

Since the last ping. Review/apply before they age into the weekly cycle." \
      || fail_ping "sendMessage failed; cursor not advanced (will retry)"
    write_state '.last_ping = {ids: $ids, utc: $utc}' --argjson ids "$ids_json" --arg utc "$now_iso" \
      || fail_ping "state write failed after delivered ping"
    logger -t openclaw-hermes-review "hourly: pinged ${new_count} new, cursor advanced"
  elif [[ -n "$removed" ]]; then
    # No new items, but some pinged ids disappeared: prune so a later reappearance
    # counts as new again (T16). No message.
    write_state '.last_ping = {ids: $ids, utc: $utc}' --argjson ids "$ids_json" --arg utc "$now_iso" \
      || fail_ping "state prune write failed"
    logger -t openclaw-hermes-review "hourly: pruned deleted ids, cursor synced (silent)"
  else
    logger -t openclaw-hermes-review "hourly: nothing new (silent)"
  fi
  exit 0
fi

# ----------------------------------------------------------------------------
# --weekly
# Suppression gate: skip if a manual run finished < 24h ago. Malformed state is
# fatal (fail-closed); a missing state file means "no manual run yet".
if [[ -f "$STATE_FILE" ]]; then
  jq -e . "$STATE_FILE" >/dev/null 2>&1 || fail_weekly "state.json malformed"
fi
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

# Freshen the canonical checkout, fail-closed on any step (no cd; use git -C).
{
  echo "=== ${now_iso} refreshing ${CANONICAL_REPO} (${CANONICAL_BRANCH}) ==="
} >> "$LOG_FILE" 2>&1
git -C "$CANONICAL_REPO" fetch --quiet origin "$CANONICAL_BRANCH"    >> "$LOG_FILE" 2>&1 || fail_weekly "canonical fetch failed"
git -C "$CANONICAL_REPO" checkout --quiet "$CANONICAL_BRANCH"        >> "$LOG_FILE" 2>&1 || fail_weekly "canonical checkout failed"
git -C "$CANONICAL_REPO" pull --ff-only --quiet                      >> "$LOG_FILE" 2>&1 || fail_weekly "canonical pull --ff-only failed"
if [[ -n "$(git -C "$CANONICAL_REPO" status --porcelain 2>/dev/null)" ]]; then
  fail_weekly "canonical checkout is dirty; refusing to run"
fi

# Pick the latest dated snapshot.
snapshot_dir=$(ls -1d "${SNAPSHOT_ROOT%/}"/*/ 2>/dev/null | sort | tail -1)
snapshot_dir=${snapshot_dir%/}
[[ -n "$snapshot_dir" && -d "$snapshot_dir" ]] || fail_weekly "no dated snapshot under ${SNAPSHOT_ROOT}"
snap_date=$(basename "$snapshot_dir")

logger -t openclaw-hermes-review "running weekly review on ${snapshot_dir}"
export PATH=/home/openclaw/.npm-global/bin:$PATH
output_file=$(mktemp)
trap 'rm -f "$output_file"' EXIT

openclaw agent --agent hermes-memory-review-agent \
  --message "/hermes-memory-review --scheduled --snapshot ${snapshot_dir} --canonical-repo ${CANONICAL_REPO} --canonical-branch ${CANONICAL_BRANCH}" \
  > "$output_file" 2>&1
rc=$?
end_iso=$(date -u +%FT%TZ)

{ echo "=== ${now_iso} weekly run starting (rc=${rc}) on ${snapshot_dir} ==="
  cat "$output_file"
  echo "=== ${end_iso} weekly run completed ==="
} >> "$LOG_FILE" 2>&1

field() { grep -E "^- $1: " "$output_file" | head -1 | sed -E "s/^- $1: //"; }
numfield() { field "$1" | grep -oE '[0-9]+' | head -1; }

# Fail-closed: a real run exits 0 AND emits a parseable, expected run-result.
(( rc == 0 )) || fail_weekly "agent exited ${rc}" "$rc" "$(tail -c 1000 "$output_file")"
status=$(field 'Status')
trigger=$(field 'Trigger')
case "$status" in
  ok|no-op|failed) ;;
  *) fail_weekly "no/invalid Status in run-result ('${status}')" 1 "$(tail -c 1000 "$output_file")" ;;
esac
[[ "$trigger" == "weekly-review" ]] || fail_weekly "unexpected Trigger '${trigger}'" 1 "$(tail -c 1000 "$output_file")"

if [[ "$status" == "failed" ]]; then
  fail_weekly "$(field 'Error' || echo 'agent reported failure')" 0
fi

findings=$(numfield 'Findings'); findings=${findings:-0}
sessions=$(numfield 'Sessions'); sessions=${sessions:-0}
staged_sk=$(numfield 'Staged skills'); staged_sk=${staged_sk:-0}
staged_mem=$(numfield 'Staged memory'); staged_mem=${staged_mem:-0}
commit=$(field 'Commit'); commit=${commit:-unknown}
report_rel=$(field 'Report path')

if [[ "$status" == "no-op" ]]; then
  tg "$REVIEW_THREAD_ID" "[hermes-review] Weekly review — ${snap_date} (no change)

Findings: ${findings}
Sessions reviewed: ${sessions} · staged skills: ${staged_sk} · staged memory: ${staged_mem}
Commit: none (no change)

Report unchanged from last run. Proposes only — review and promote by hand." || true
  logger -t openclaw-hermes-review "weekly: no-op for ${snap_date}"
  exit 0
fi

# status == ok: validate the report path, then deliver the file, then the summary.
[[ "$report_rel" == "reviews/memory-review/${snap_date}.md" ]] \
  || fail_weekly "report path mismatch: '${report_rel}' != reviews/memory-review/${snap_date}.md"

report_abs="${CANONICAL_REPO%/}/${report_rel}"
if [[ ! -f "$report_abs" ]] || ! tg_doc "$REVIEW_THREAD_ID" "$report_abs" "[hermes-review] ${snap_date} review"; then
  logger -t openclaw-hermes-review "weekly: report delivery FAILED (${report_abs}); commit ${commit} stands"
  tg "$REVIEW_THREAD_ID" "[hermes-review] ⚠ weekly report delivery FAILED

Snapshot: ${snap_date} · commit ${commit} on ${CANONICAL_BRANCH} is valid and committed.
The report could not be delivered to Telegram. Fetch it from the canonical repo or ${LOG_FILE} on VPS." || true
  exit 1
fi

tg "$REVIEW_THREAD_ID" "[hermes-review] Weekly review — ${snap_date}

Findings: ${findings}
Sessions reviewed: ${sessions} · staged skills: ${staged_sk} · staged memory: ${staged_mem}
Commit: ${commit} on ${CANONICAL_BRANCH}

Report attached above. Proposes only — review and promote by hand." || true
logger -t openclaw-hermes-review "weekly: delivered review for ${snap_date} (${findings} findings)"
exit 0
