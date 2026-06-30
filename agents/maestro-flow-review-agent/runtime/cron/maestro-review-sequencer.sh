#!/usr/bin/env bash
# maestro-review-sequencer.sh — windowed per-subfolder scheduled review (ADR-001).
#
# Runs as ROOT (needs swapoff/swapon for M3 reclaim and systemctl for the M12
# breaker); su's to `openclaw` for each agent unit. Implements M1-M12. Re-enable
# of the schedule is gated on G1-G10 (see ADR-001) — this script is the artifact,
# not yet wired to cron.
#
# Usage:
#   maestro-review-sequencer.sh             # full scheduled cycle
#   maestro-review-sequencer.sh --dry-run   # plan only: discovery, order, drift,
#                                             gate read; NO agent/model/swapoff/systemctl
set -uo pipefail

DRY_RUN=0; NO_PR=0; ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1;;            # plan only: no agent/model/swapoff/systemctl
    --no-pr)   NO_PR=1;;              # review-only units (gate testing — no outward PR)
    --only)    shift; ONLY="${1:-}";; # process just this one subfolder (gate testing)
  esac
  shift
done

# ---- paths ----
REPO=/home/openclaw/ios.config
FLOWS_DIR="$REPO/.maestro/flows"
AGENT=maestro-flow-review-agent
AGENT_DIR=/home/openclaw/.openclaw/agents/$AGENT
SESSIONS_DIR=$AGENT_DIR/sessions
STATE_ROOT=$AGENT_DIR/cycle-state
SNAPSHOT=/home/openclaw/.openclaw/scripts/maestro-flows-manifest.txt   # deployed copy of the committed snapshot
OPENCLAW_JSON=/home/openclaw/.openclaw/openclaw.json
OPENCLAW_BIN=/home/openclaw/.npm-global/bin/openclaw
LOCK=/run/lock/maestro-review.lock
LOG=/home/openclaw/.openclaw/logs/maestro-review-sequencer.log

# ---- tunables (ADR-001 gate constants; baselines from 2026-06-30 live test) ----
TURN_BUDGET=540     # M4: inner timeout, < 630s gateway (payments baseline 252s)
AVAIL_FLOOR=600     # M3: MemAvailable (MB) required to start a unit
HARD_FLOOR=250      # M12: breaker abort floor (MB)
SWAP_HIGH=600       # M3: swap-used (MB) that triggers guarded reclaim
RESERVE=400         # M3: avail must exceed SwapUsed+RESERVE for safe reclaim
HOOK_MAX=8          # M12: openclaw-hooks ceiling (baseline <=6)
SAMPLES=3           # M3: consecutive sustained-headroom samples
SAMPLE_GAP=3        # seconds between samples
STALE_CYCLE_HOURS=6 # resume an incomplete cycle younger than this; else start fresh

CHAT_ID=-1003954520541
THREAD_ID=2
BOT_TOKEN=""

log(){ printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >> "$LOG" 2>/dev/null; [ "$DRY_RUN" = 1 ] && printf '%s\n' "$*"; }
load_token(){ BOT_TOKEN=$(jq -r '.channels.telegram.accounts["ai-labs"].botToken // empty' "$OPENCLAW_JSON" 2>/dev/null || true); }
tg(){ if [ "$DRY_RUN" = 1 ]; then log "TG> $1"; return; fi; [ -z "$BOT_TOKEN" ] && return; curl -fsS -m 10 -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" --data-urlencode "chat_id=$CHAT_ID" --data-urlencode "message_thread_id=$THREAD_ID" --data-urlencode "text=$1" --data-urlencode "disable_web_page_preview=true" -o /dev/null || true; }

mem_avail(){ free -m | awk '/^Mem:/{print $7}'; }
swap_used(){ free -m | awk '/^Swap:/{print $3}'; }
load1(){ cut -d' ' -f1 /proc/loadavg; }
hooks_count(){ ps -eo comm= | grep -c '^openclaw-hooks$'; }
appserver_count(){ ps -eo comm= | grep -c '^codex$'; }

# discover .maestro/flows subfolders with flow counts, smallest-first (Decision 6)
discover_units(){
  local d n
  for d in "$FLOWS_DIR"/*/; do
    [ -d "$d" ] || continue
    n=$(find "$d" -maxdepth 1 \( -name '*.yaml' -o -name '*.yml' \) 2>/dev/null | wc -l | tr -d ' ')
    printf '%s %s\n' "$n" "$(basename "$d")"
  done | sort -n -k1,1 -k2,2
}

# M8: report subfolder-set drift vs the committed snapshot (does not block)
drift_check(){
  [ -f "$SNAPSHOT" ] || { log "drift: snapshot $SNAPSHOT missing — skipping"; return; }
  local disc snap added removed
  disc=$(discover_units | awk '{print $2}' | sort)
  snap=$(grep -vE '^#' "$SNAPSHOT" | awk '{print $2}' | sort)
  added=$(comm -23 <(printf '%s\n' "$disc") <(printf '%s\n' "$snap") | tr '\n' ' ')
  removed=$(comm -13 <(printf '%s\n' "$disc") <(printf '%s\n' "$snap") | tr '\n' ' ')
  if [ -n "${added// }" ] || [ -n "${removed// }" ]; then
    log "DRIFT added=[$added] removed=[$removed]"
    tg "[maestro-seq] ⚠ flow-subfolder drift vs snapshot — added: ${added:-none}removed: ${removed:-none}. Regenerate maestro-flows-manifest.txt."
  else
    log "drift: none (snapshot matches discovery)"
  fi
}

# M3: guarded reclaim + sustained headroom. returns 1 => stop cycle (dangerous, M7)
gate(){
  local sw av i
  sw=$(swap_used); av=$(mem_avail)
  if [ "$sw" -ge "$SWAP_HIGH" ]; then
    if [ "$av" -ge $(( sw + RESERVE )) ]; then
      log "reclaim: swapU=${sw} avail=${av} -> swapoff/swapon"
      if [ "$DRY_RUN" = 0 ]; then
        if ! ( timeout 60 swapoff -a && swapon -a ); then
          log "reclaim FAILED"; tg "[maestro-seq] ⚠ swap reclaim FAILED — cycle stopped."; return 1
        fi
      fi
    else
      log "reclaim DEFERRED: avail=${av} < swap=${sw}+${RESERVE}"
      tg "[maestro-seq] ⚠ reclaim deferred — host too tight (avail ${av}M < swap ${sw}M + ${RESERVE}M); cycle stopped."
      return 1
    fi
  fi
  for i in $(seq 1 "$SAMPLES"); do
    av=$(mem_avail)
    if [ "$av" -lt "$AVAIL_FLOOR" ]; then log "headroom low: avail=${av} < ${AVAIL_FLOOR} (sample $i/$SAMPLES)"; return 1; fi
    [ "$i" -lt "$SAMPLES" ] && [ "$DRY_RUN" = 0 ] && sleep "$SAMPLE_GAP"
  done
  log "gate OK: avail=$(mem_avail) swapU=$(swap_used) load=$(load1)"
  return 0
}

# run one unit. returns 0 ok | 1 clean-fail (continue) | 2 dangerous (stop cycle)
run_unit(){
  local unit="$1" cycle="$2" cdir="$3"
  local sk="maestro-sched-${unit}-${cycle}" out="/tmp/maestro-seq-${unit}.out"
  local breach="$cdir/${unit}.breach"
  rm -f "$breach"; : > "$out"
  touch "$cdir/${unit}.in_flight"

  local norpr=""
  [ "$NO_PR" = 1 ] && norpr=" Do NOT create a branch, do NOT push, do NOT open or update any PR. Review-only."

  local mon=""
  if [ "$DRY_RUN" = 0 ]; then
    ( while [ -e "$cdir/${unit}.in_flight" ]; do
        h=$(hooks_count); a=$(mem_avail); s=$(appserver_count)
        if [ "$h" -gt "$HOOK_MAX" ] || [ "$a" -lt "$HARD_FLOOR" ] || [ "$s" -gt 1 ]; then
          echo "hooks=$h avail=$a appsrv=$s" > "$breach"
          systemctl stop openclaw   # M12: cgroup halt of a gateway-side swarm
          break
        fi
        sleep 4
      done ) &
    mon=$!
  fi

  local t0 t1 rc
  t0=$(date +%s)
  if [ "$DRY_RUN" = 1 ]; then
    log "DRY: would run unit '$unit' session=$sk timeout=${TURN_BUDGET}s"; printf -- '- Findings: 0\n- PR: none\n' > "$out"; rc=0
  else
    su - openclaw -c "cd '$REPO' && timeout $TURN_BUDGET '$OPENCLAW_BIN' agent --agent $AGENT --session-key '$sk' --message '/maestro-review .maestro/flows/${unit}/ -- SCHEDULED windowed unit: review ONLY the flows under .maestro/flows/${unit} and their runFlow chains. Output the standard review format plus the run-summary field block. Do NOT write the manual-run state file.${norpr}'" > "$out" 2>&1
    rc=$?
  fi
  t1=$(date +%s)
  rm -f "$cdir/${unit}.in_flight"; [ -n "$mon" ] && wait "$mon" 2>/dev/null
  [ "$DRY_RUN" = 0 ] && find "$SESSIONS_DIR" -maxdepth 1 -type f -delete 2>/dev/null   # M2/G5 quarantine

  local dur=$((t1 - t0))
  if [ -e "$breach" ]; then
    log "unit $unit BREAKER TRIPPED ($(cat "$breach")) dur=${dur}s"
    printf 'BREAKER %s\n' "$(cat "$breach")" > "$cdir/${unit}.failed"
    tg "[maestro-seq] ⚠ unit ${unit} — circuit breaker tripped; gateway stopped, cycle halted."
    return 2
  fi
  if [ "$rc" = 124 ]; then
    log "unit $unit TIMEOUT >${TURN_BUDGET}s dur=${dur}s"
    echo "TIMEOUT (needs split, M5)" > "$cdir/${unit}.failed"
    tg "[maestro-seq] ⚠ unit ${unit} FAILED — exceeded ${TURN_BUDGET}s; SPLIT required before retry (ADR M5)."
    return 2
  fi
  if grep -q 'EMBEDDED FALLBACK' "$out" 2>/dev/null; then
    log "unit $unit embedded-fallback detected dur=${dur}s"
    echo "FALLBACK" > "$cdir/${unit}.failed"
    tg "[maestro-seq] ⚠ unit ${unit} FAILED — embedded-fallback path; cycle stopped."
    return 2
  fi
  local findings
  findings=$(grep -E '^- Findings:' "$out" | grep -oE '[0-9]+' | head -1)
  if [ "$rc" != 0 ] || [ -z "$findings" ]; then
    log "unit $unit clean-fail rc=$rc (no run-summary) dur=${dur}s"
    echo "rc=$rc no-summary" > "$cdir/${unit}.failed"
    tg "[maestro-seq] ⚠ unit ${unit} run FAILED (rc=$rc) — see log."
    return 1
  fi
  echo "findings=$findings dur=${dur}s" > "$cdir/${unit}.completed"
  log "unit $unit OK findings=$findings dur=${dur}s"
  if [ "$findings" -gt 0 ]; then
    tg "[maestro-seq] ${unit}: ${findings} finding(s) — $(grep -E '^- PR:' "$out" | sed 's/^- PR: //' | head -1)"
  else
    tg "[maestro-seq] ✓ ${unit} — 0 findings"
  fi
  return 0
}

main(){
  mkdir -p "$STATE_ROOT" "$(dirname "$LOG")" 2>/dev/null
  load_token

  exec 9>"$LOCK" || { log "cannot open lock $LOCK"; exit 1; }      # M11 host-wide lock
  if ! flock -n 9; then log "lock held — another maestro review running; deferring"; tg "[maestro-seq] ⏸ deferred — another maestro review is running."; exit 0; fi

  # resume the newest incomplete, non-stale cycle, else start a new one (M10)
  local cycle="" cdir="" resume="" d age
  for d in $(ls -1dt "$STATE_ROOT"/*/ 2>/dev/null); do
    [ -e "${d}rolled_up" ] && continue
    [ -e "${d}started" ] || continue
    age=$(( $(date +%s) - $(stat -c %Y "${d}started") ))
    [ "$age" -lt $(( STALE_CYCLE_HOURS * 3600 )) ] && resume="$d"
    break
  done

  if [ -n "$resume" ]; then
    cdir="${resume%/}"; cycle=$(basename "$cdir")
    log "RESUME cycle $cycle"
    local f u
    for f in "$cdir"/*.in_flight; do [ -e "$f" ] || continue; u=$(basename "$f" .in_flight); rm -f "$f"; echo "stale in_flight (wrapper restart) -> failed" > "$cdir/${u}.failed"; log "stale in_flight $u -> failed (M10)"; done
  else
    cycle=$(date -u +%Y%m%dT%H%M%SZ); cdir="$STATE_ROOT/$cycle"; mkdir -p "$cdir"
    { echo "# frozen cycle scope $cycle @ $(cd "$REPO" && git rev-parse --short HEAD 2>/dev/null)"; discover_units; } > "$cdir/frozen-manifest.txt"
    touch "$cdir/started"
    log "NEW cycle $cycle ($(grep -cvE '^#' "$cdir/frozen-manifest.txt") units, smallest-first)"
    drift_check
  fi

  local stopped=0 nfail=0 nfind=0 cnt unit r f
  while read -r cnt unit; do
    [ -z "$unit" ] && continue
    [ -n "$ONLY" ] && [ "$unit" != "$ONLY" ] && continue
    if [ -e "$cdir/${unit}.completed" ]; then f=$(grep -oE '[0-9]+' "$cdir/${unit}.completed" | head -1); nfind=$((nfind + ${f:-0})); log "skip $unit (completed)"; continue; fi
    if ! gate; then log "gate failed before $unit -> stop cycle"; tg "[maestro-seq] ⚠ cycle stopped before ${unit} — insufficient headroom."; stopped=1; break; fi
    run_unit "$unit" "$cycle" "$cdir"; r=$?
    case "$r" in
      0) f=$(grep -oE '[0-9]+' "$cdir/${unit}.completed" | head -1); nfind=$((nfind + ${f:-0}));;
      1) nfail=$((nfail + 1));;
      2) nfail=$((nfail + 1)); stopped=1;;
    esac
    if [ "$r" = 2 ]; then
      if grep -q BREAKER "$cdir/${unit}.failed" 2>/dev/null && [ "$DRY_RUN" = 0 ]; then
        log "breaker stopped gateway -> clearing session + restarting"
        find "$SESSIONS_DIR" -maxdepth 1 -type f -delete 2>/dev/null
        systemctl start openclaw
      fi
      break
    fi
  done < <(grep -vE '^#' "$cdir/frozen-manifest.txt")

  if [ ! -e "$cdir/rolled_up" ]; then    # M10 idempotent roll-up
    local total done failed
    total=$(grep -cvE '^#' "$cdir/frozen-manifest.txt")
    done=$(ls "$cdir"/*.completed 2>/dev/null | wc -l | tr -d ' ')
    failed=$(ls "$cdir"/*.failed 2>/dev/null | wc -l | tr -d ' ')
    if [ "$stopped" = 1 ]; then
      tg "[maestro-seq] ⚠ cycle ${cycle} STOPPED — ${done}/${total} units, ${failed} failed, ${nfind} findings."
    else
      tg "[maestro-seq] ✓ cycle ${cycle} done — ${done}/${total} units, ${nfind} findings, ${failed} failed."
    fi
    touch "$cdir/rolled_up"
    log "cycle $cycle rolled up: done=$done failed=$failed findings=$nfind stopped=$stopped"
  fi

  [ "$DRY_RUN" = 0 ] && find "$SESSIONS_DIR" -maxdepth 1 -type f -delete 2>/dev/null
  flock -u 9
}

main "$@"
