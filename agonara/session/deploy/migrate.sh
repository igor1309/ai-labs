#!/usr/bin/env bash
# Explicit local handoff; legacy reading files and the standalone binary remain intact.
set -Eeuo pipefail
runnerHome=${AGONARA_SESSION_HOME:-$HOME/.local/share/agonara-session}
launchDir=${AGONARA_SESSION_LAUNCH_DIR:-$HOME/Library/LaunchAgents}
envFile=${AGONARA_SESSION_ENV_FILE:-$HOME/.config/agonara-session/probe.env}
launchctlBin=${AGONARA_SESSION_LAUNCHCTL:-launchctl}
curlBin=${AGONARA_SESSION_CURL:-curl}
sleepBin=${AGONARA_SESSION_SLEEP:-sleep}
domain=gui/$(id -u)
sessionLabel=$domain/ai.labs.agonara-session
webLabel=$domain/ai.labs.agonara-web
bin=$runnerHome/bin/agonara-session
staged=$bin.new
record=$runnerHome/rollback

loaded() { "$launchctlBin" print "$1" >/dev/null 2>&1; }
stop() {
  if loaded "$1"; then
    "$launchctlBin" bootout "$1" || return 1
    if loaded "$1"; then echo "service did not stop: $1" >&2; return 1; fi
  fi
}
bootstrap() { "$launchctlBin" enable "$domain/$1" || return 1; "$launchctlBin" bootstrap "$domain" "$launchDir/$1.plist"; }
restore() {
  stop "$sessionLabel" || return 1
  stop "$webLabel" || return 1
  cp -p "$record/agonara-session" "$bin" || return 1
  if [[ -f "$record/single-owner" ]]; then
    cp -p "$record/single-owner" "$runnerHome/single-owner" || return 1
  else
    rm -f "$runnerHome/single-owner" || return 1
  fi
  if [[ -f "$record/web-loaded" ]]; then bootstrap ai.labs.agonara-web || return 1; fi
  if [[ -f "$record/session-loaded" ]]; then bootstrap ai.labs.agonara-session || return 1; fi
  restored_available
}
restored_available() {
  # Rollback gates on availability of the restored jobs, never the failed version's identity.
  if [[ -f "$record/web-loaded" ]]; then loaded "$webLabel" || return 1; fi
  if [[ -f "$record/session-loaded" ]]; then loaded "$sessionLabel" || return 1; fi
  if [[ -f "$record/web-loaded" || ( -f "$record/single-owner" && -f "$record/session-loaded" ) ]]; then
    local available=false
    for attempt in {1..10}; do
      if [[ "$("$curlBin" -s --max-time 2 -o /dev/null -w '%{http_code}' "${AGONARA_SESSION_HEALTH_URL:-http://127.0.0.1:8740/}")" == 401 ]]; then available=true; break; fi
      "$sleepBin" 1
    done
    [[ "$available" == true ]] || return 1
  fi
}
case "${1:-}" in
check)
  "$staged" -env-file="$envFile" -check-config
  echo "single-owner migration configuration valid"
  ;;
activate)
  "$staged" -env-file="$envFile" -check-config
  [[ -f "$bin" && -f "$launchDir/ai.labs.agonara-session.plist" ]] || { echo "existing runner and launchd configuration required" >&2; exit 1; }
  mkdir -p "$record"
  cp -p "$bin" "$record/agonara-session"
  rm -f "$record/web-loaded" "$record/session-loaded" "$record/single-owner"
  if [[ -f "$runnerHome/single-owner" ]]; then cp -p "$runnerHome/single-owner" "$record/single-owner"; fi
  swapped=false
  if loaded "$webLabel"; then touch "$record/web-loaded"; fi
  if loaded "$sessionLabel"; then touch "$record/session-loaded"; fi
  rollback_failure() {
    trap - ERR
    echo "activation failed; restoring previous services" >&2
    if [[ "$swapped" == true ]]; then
      if ! restore; then echo "rollback failed; services require operator attention" >&2; fi
    else
      if [[ -f "$record/web-loaded" ]] && ! loaded "$webLabel"; then bootstrap ai.labs.agonara-web || echo "web restore failed" >&2; fi
      if [[ -f "$record/session-loaded" ]] && ! loaded "$sessionLabel"; then bootstrap ai.labs.agonara-session || echo "session restore failed" >&2; fi
      restored_available || echo "restored services unavailable; operator attention required" >&2
    fi
    exit 1
  }
  trap rollback_failure ERR
  stop "$webLabel"
  stop "$sessionLabel"
  "$launchctlBin" disable "$webLabel"
  mv "$staged" "$bin"
  swapped=true
  bootstrap ai.labs.agonara-session
  ready=false
  for attempt in {1..10}; do
    if "$bin" -env-file="$envFile" -check-running; then ready=true; break; fi
    "$sleepBin" 1
  done
  [[ "$ready" == true ]]
  touch "$runnerHome/single-owner"
  trap - ERR
  echo "single reading owner active; legacy files retained"
  ;;
rollback)
  [[ -f "$record/agonara-session" ]] || { echo "no rollback binary" >&2; exit 1; }
  restore
  echo "previous services restored; legacy files retained"
  ;;
*) echo "usage: $0 check | activate | rollback" >&2; exit 2 ;;
esac
