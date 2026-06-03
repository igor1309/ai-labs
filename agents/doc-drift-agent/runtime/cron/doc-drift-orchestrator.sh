#!/usr/bin/env bash
# Scoped nightly orchestrator for the doc-drift-agent (ADR-001 §7 substrate).
#
# Flow (imperative shell — decision logic stays in the tested CLIs, never here):
#   1. Refresh /home/openclaw/ai-labs to latest trunk; capture HEAD.
#   2. `select` CLI → the one scope to audit this tick (changed ∪ stale, budget 1),
#      or nothing → recorded no-op.
#   3. `openclaw agent --scope <id>` worker turn for that scope.
#   4. Fail-closed: a real run exits 0 AND emits the parseable report header.
#   5. `commit` CLI → record the scope audited at HEAD (advances per-scope state)
#      — only on a verified-good audit.
#   6. Exactly one Telegram message per agent/notification-spec.md.
#
# Observability (ADR-001 §7): this wrapper's fail-closed Telegram alert + this log
# + the per-scope state file. (The tasks/TaskFlow ledger is broken on the unit —
# agents/TODO.md §4; `openclaw cron runs` covers only native single-turn jobs.)
#
# Supersedes doc-drift-cron.sh (the all-READMEs-in-one-pass wrapper). The bot token
# is read from ~/.openclaw/openclaw.json (mode 600) at runtime, never inlined.
#
# Deployed to: /home/openclaw/.openclaw/scripts/doc-drift-orchestrator.sh (mode 700).
# Notifications post via the shared `ai-labs` account into the #doc-drift topic.
set -uo pipefail

# Config — deploy defaults; each is env-overridable so the wiring can be exercised
# with stubs (doc-drift-orchestrator.test.sh) without touching the live host.
: "${REPO_PATH:=/home/openclaw/ai-labs}"
: "${SCOPE_SELECT:=${REPO_PATH}/agents/doc-drift-agent/scope-select}"
: "${STATE_FILE:=/home/openclaw/.openclaw/agents/doc-drift-agent/orchestrator-state.json}"
: "${LOG_FILE:=/home/openclaw/.openclaw/logs/doc-drift-cron.log}"
: "${OPENCLAW_JSON:=/home/openclaw/.openclaw/openclaw.json}"
: "${CHAT_ID:=-1003954520541}"          # ai-labs agents supergroup
: "${THREAD_ID:=4}"                      # #doc-drift forum topic
: "${STALENESS_DAYS:=30}"
: "${BUDGET:=1}"
: "${OPENCLAW_BIN_DIR:=/home/openclaw/.npm-global/bin}"

export PATH="${OPENCLAW_BIN_DIR}:$PATH"

BOT_TOKEN=$(jq -r '.channels.telegram.accounts["ai-labs"].botToken // empty' "$OPENCLAW_JSON" 2>/dev/null)
if [[ -z "$BOT_TOKEN" ]]; then
  logger -t openclaw-doc-drift "ERROR: ai-labs bot token missing in $OPENCLAW_JSON"
  exit 1
fi

tg() {
  curl -fsS -m 10 -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${CHAT_ID}" \
    --data-urlencode "message_thread_id=${THREAD_ID}" \
    --data-urlencode "text=${1}" \
    --data-urlencode "disable_web_page_preview=true" \
    -o /dev/null || true
}

now_human=$(date -u +'%Y-%m-%d %H:%M UTC')
now_iso=$(date -u +%FT%TZ)

# --- 1. refresh source clone (REFRESH=0 skips the network pull; for tests) ---
if [[ "${REFRESH:-1}" != "0" ]]; then
  {
    echo "=== ${now_iso} orchestrator: refreshing ${REPO_PATH} ==="
    cd "$REPO_PATH" || exit 1
    git fetch --quiet origin trunk
    git checkout --quiet trunk
    git pull --ff-only --quiet
    echo "head: $(git log --oneline -1)"
  } >> "$LOG_FILE" 2>&1
fi
head_commit=$(git -C "$REPO_PATH" rev-parse HEAD)

# --- 2. select the scope for this tick ---
scope=$(node "${SCOPE_SELECT}/select-cli.js" \
  --state "$STATE_FILE" --repo "$REPO_PATH" \
  --budget "$BUDGET" --staleness-days "$STALENESS_DAYS" 2>>"$LOG_FILE" | head -1)

if [[ -z "$scope" ]]; then
  logger -t openclaw-doc-drift "no eligible scope — recorded no-op"
  echo "=== ${now_iso} no eligible scope — no-op (state unchanged) ===" >> "$LOG_FILE"
  exit 0
fi

logger -t openclaw-doc-drift "auditing scope '${scope}' @ ${head_commit}"

# --- 3. run the worker on the selected scope ---
output_file=$(mktemp)
trap 'rm -f "$output_file"' EXIT
openclaw agent --agent doc-drift-agent \
  --message "/doc-drift-review --scheduled --scope ${scope}" > "$output_file" 2>&1
rc=$?
end_iso=$(date -u +%FT%TZ)

{ echo "=== ${now_iso} scope '${scope}' run starting (rc=${rc}) ==="
  cat "$output_file"
  echo "=== ${end_iso} scope '${scope}' run completed ==="
} >> "$LOG_FILE" 2>&1

# --- 4. fail-closed: non-zero exit OR no parseable report ⇒ alert, do NOT commit ---
if (( rc != 0 )) || ! grep -qE "^- Findings: " "$output_file"; then
  logger -t openclaw-doc-drift "ERROR: scope '${scope}' run failed (rc=${rc})"
  tg "[doc-drift] ⚠ run FAILED — scope ${scope}

Run: scheduled · ${now_human}
Exit: ${rc} · report: $(grep -qE '^- Findings: ' "$output_file" && echo present || echo missing)
Per-scope state left unchanged (will retry next tick). Check the gateway and ${LOG_FILE}.

$(tail -c 1000 "$output_file")"
  exit 1
fi

# --- 5. commit: record this scope audited at HEAD (only after a good audit) ---
node "${SCOPE_SELECT}/commit-cli.js" \
  --state "$STATE_FILE" --scope "$scope" \
  --commit "$head_commit" --at "$end_iso" >> "$LOG_FILE" 2>&1

# --- 6. notify (drift-found / silent), per agent/notification-spec.md ---
field() { grep -E "^- $1: " "$output_file" | head -1 | sed -E "s/^- $1: //"; }
num() { echo "${1:-0}" | grep -oE '[0-9]+' | head -1; }

findings=$(num "$(field 'Findings')"); findings=${findings:-0}
opened=$(num "$(field 'Fix PRs opened')"); opened=${opened:-0}
tracked=$(num "$(field 'Already tracked')"); tracked=${tracked:-0}
commit=$(field 'Repo commit' | awk '{print $1}'); commit=${commit:-${head_commit:0:7}}

if (( findings > 0 )); then
  pr_urls=$(grep -oE 'https://github\.com/[^ |)]+/pull/[0-9]+' "$output_file" | awk '!seen[$0]++')
  if [[ -n "$pr_urls" ]]; then
    pr_block=$(echo "$pr_urls" | sed 's/^/- /')
  else
    pr_block="- (no PR opened — see ${LOG_FILE} on VPS)"
  fi
  tg "[doc-drift] Drift found — ${findings} finding(s) · scope ${scope}

Run: scheduled · ${now_human}
Commit: ${commit} on trunk

PRs opened: ${opened} · already tracked: ${tracked}
${pr_block}

Do not auto-merge. Review each PR manually."
fi
# scheduled + 0 findings is silent per spec.
