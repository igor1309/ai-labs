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
HOOK_MAX=8          # M12: openclaw-hooks ceiling (baseline <=6; swarm plateaus AT 8 = gateway concurrency cap)
SWAP_ABORT=1000     # M12: swap-used (MB) breaker ceiling — the REAL OOM precursor. 2026-06-30 G2 thrash held avail ~500 (>HARD_FLOOR) while swap filled to 1279; hooks/avail alone missed it.
SAMPLES=3           # M3: consecutive sustained-headroom samples
SAMPLE_GAP=3        # seconds between samples
BIN_SIZE=6          # Decision 1 / M5: max flows per unit (bin). Bounds per-window work so no single subfolder (payments=32) can swarm the box. Sized vs the heavy-path footprint, NOT the retracted ~200MB light baseline. Validated by G1/G2.
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

# discover .maestro/flows bins: each subfolder split into <=BIN_SIZE-flow bins,
# emitted "<binflows> <subfolder>__bin<NN> <relpath...>", smallest-first (Decision 1, 6).
# Flow paths are relative to FLOWS_DIR and assumed space-free (maestro flow filenames).
discover_units(){
  local d folder files n i b bid list cnt
  for d in "$FLOWS_DIR"/*/; do
    [ -d "$d" ] || continue
    folder=$(basename "$d")
    files=$(cd "$FLOWS_DIR" && find "$folder" -maxdepth 1 \( -name '*.yaml' -o -name '*.yml' \) 2>/dev/null | sort)
    [ -z "$files" ] && continue
    n=$(printf '%s\n' "$files" | wc -l | tr -d ' ')
    i=0; b=0
    while [ "$i" -lt "$n" ]; do
      b=$((b + 1))
      bid=$(printf '%s__bin%02d' "$folder" "$b")
      list=$(printf '%s\n' "$files" | sed -n "$((i + 1)),$((i + BIN_SIZE))p" | tr '\n' ' ' | sed 's/ *$//')
      cnt=$(printf '%s\n' "$list" | wc -w | tr -d ' ')
      printf '%s %s %s\n' "$cnt" "$bid" "$list"
      i=$((i + BIN_SIZE))
    done
  done | sort -k1,1n -k2,2
}

# M8: report subfolder-set drift vs the committed snapshot (does not block)
drift_check(){
  [ -f "$SNAPSHOT" ] || { log "drift: snapshot $SNAPSHOT missing — skipping"; return; }
  local disc snap added removed
  disc=$(discover_units | awk '{print $2}' | sed 's/__bin[0-9]*$//' | sort -u)
  snap=$(grep -vE '^#' "$SNAPSHOT" | awk '{print $2}' | sort -u)
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
  local unit="$1" cycle="$2" cdir="$3" flows="$4"
  local sk="maestro-sched-${unit}-${cycle}" out="$cdir/${unit}.out"   # in the root-owned cycle dir, not sticky /tmp (fs.protected_regular blocks cross-owner writes)
  local breach="$cdir/${unit}.breach"
  local fl_full="" f                                                  # flow-list scope: full paths under .maestro/flows/
  for f in $flows; do fl_full="$fl_full .maestro/flows/$f"; done
  fl_full="${fl_full# }"
  rm -f "$breach"; : > "$out"
  touch "$cdir/${unit}.in_flight"

  local norpr=""
  [ "$NO_PR" = 1 ] && norpr=" Do NOT create a branch, do NOT push, do NOT open or update any PR. Review-only."

  local mon=""
  if [ "$DRY_RUN" = 0 ]; then
    ( while [ -e "$cdir/${unit}.in_flight" ]; do
        h=$(hooks_count); a=$(mem_avail); s=$(appserver_count); w=$(swap_used)
        if [ "$w" -gt "$SWAP_ABORT" ] || [ "$h" -ge "$HOOK_MAX" ] || [ "$a" -lt "$HARD_FLOOR" ] || [ "$s" -gt 1 ]; then
          echo "swapU=$w hooks=$h avail=$a appsrv=$s" > "$breach"
          systemctl stop openclaw   # M12: cgroup halt of a gateway-side swarm
          break
        fi
        sleep 2
      done ) &
    mon=$!
  fi

  local t0 t1 rc
  t0=$(date +%s)
  if [ "$DRY_RUN" = 1 ]; then
    log "DRY: would run unit '$unit' (${fl_full}) session=$sk timeout=${TURN_BUDGET}s"; printf -- '- Findings: 0\n- PR: none\n' > "$out"; rc=0
  else
    su - openclaw -c "cd '$REPO' && timeout $TURN_BUDGET '$OPENCLAW_BIN' agent --agent $AGENT --session-key '$sk' --message '/maestro-review --flows ${fl_full} -- SCHEDULED windowed unit (flow-list scope): review ONLY these flows and their runFlow chains: ${fl_full}. Do NOT expand to sibling flows not listed. Output the standard review format plus the run-summary field block. Do NOT write the manual-run state file.${norpr}'" > "$out" 2>&1
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
    log "unit $unit clean-fail rc=$rc (no run-summary) dur=${dur}s"   # per-bin clean fail: folded into the per-subfolder rollup (Decision 5)
    echo "rc=$rc no-summary" > "$cdir/${unit}.failed"
    return 1
  fi
  echo "findings=$findings dur=${dur}s" > "$cdir/${unit}.completed"   # per-bin success: folded into the per-subfolder rollup
  log "unit $unit OK findings=$findings dur=${dur}s"
  return 0
}

# Decision 5: post one notification per subfolder once all its bins are done (idempotent).
folder_rollup(){
  local unit="$1" cdir="$2" folder total nd fin failed
  folder="${unit%%__bin*}"
  total=$(awk -v f="$folder" '$2 ~ ("^" f "__bin[0-9]") {c++} END{print c+0}' "$cdir/frozen-manifest.txt")
  nd=$(ls "$cdir/${folder}__bin"*.completed "$cdir/${folder}__bin"*.failed 2>/dev/null | wc -l | tr -d ' ')
  [ "$nd" -lt "$total" ] && return
  [ -e "$cdir/${folder}.rolledup" ] && return
  touch "$cdir/${folder}.rolledup"
  fin=$(cat "$cdir/${folder}__bin"*.completed 2>/dev/null | grep -oE 'findings=[0-9]+' | grep -oE '[0-9]+' | awk '{s+=$1} END{print s+0}')
  failed=$(ls "$cdir/${folder}__bin"*.failed 2>/dev/null | wc -l | tr -d ' ')
  if [ "$failed" -gt 0 ]; then
    tg "[maestro-seq] ⚠ ${folder}: ${fin} finding(s), ${failed}/${total} bin(s) FAILED."
  elif [ "$fin" -gt 0 ]; then
    tg "[maestro-seq] ${folder}: ${fin} finding(s) across ${total} bin(s)."
  else
    tg "[maestro-seq] ✓ ${folder} — 0 findings (${total} bin(s))."
  fi
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
    log "NEW cycle $cycle ($(grep -cvE '^#' "$cdir/frozen-manifest.txt") bins, smallest-first)"
    drift_check
  fi

  local stopped=0 nfail=0 nfind=0 cnt unit flows r f
  while read -r cnt unit flows; do
    [ -z "$unit" ] && continue
    [ -n "$ONLY" ] && [ "$unit" != "$ONLY" ] && [ "${unit%%__bin*}" != "$ONLY" ] && continue   # --only matches a bin id OR a whole subfolder
    if [ -e "$cdir/${unit}.completed" ]; then f=$(grep -oE '[0-9]+' "$cdir/${unit}.completed" | head -1); nfind=$((nfind + ${f:-0})); log "skip $unit (completed)"; folder_rollup "$unit" "$cdir"; continue; fi
    if ! gate; then log "gate failed before $unit -> stop cycle"; tg "[maestro-seq] ⚠ cycle stopped before ${unit} — insufficient headroom."; stopped=1; break; fi
    run_unit "$unit" "$cycle" "$cdir" "$flows"; r=$?
    case "$r" in
      0) f=$(grep -oE '[0-9]+' "$cdir/${unit}.completed" | head -1); nfind=$((nfind + ${f:-0}));;
      1) nfail=$((nfail + 1));;
      2) nfail=$((nfail + 1)); stopped=1;;
    esac
    [ "$r" != 2 ] && folder_rollup "$unit" "$cdir"
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
    local total done failed subf
    total=$(grep -cvE '^#' "$cdir/frozen-manifest.txt")
    done=$(ls "$cdir"/*.completed 2>/dev/null | wc -l | tr -d ' ')
    failed=$(ls "$cdir"/*.failed 2>/dev/null | wc -l | tr -d ' ')
    subf=$(grep -vE '^#' "$cdir/frozen-manifest.txt" | awk '{print $2}' | sed 's/__bin[0-9]*$//' | sort -u | wc -l | tr -d ' ')
    if [ "$stopped" = 1 ]; then
      tg "[maestro-seq] ⚠ cycle ${cycle} STOPPED — ${done}/${total} bins (${subf} subfolders), ${failed} failed, ${nfind} findings."
    else
      tg "[maestro-seq] ✓ cycle ${cycle} done — ${done}/${total} bins across ${subf} subfolders, ${nfind} findings, ${failed} failed."
    fi
    touch "$cdir/rolled_up"
    log "cycle $cycle rolled up: done=$done failed=$failed findings=$nfind stopped=$stopped"
  fi

  [ "$DRY_RUN" = 0 ] && find "$SESSIONS_DIR" -maxdepth 1 -type f -delete 2>/dev/null
  flock -u 9
}

main "$@"
