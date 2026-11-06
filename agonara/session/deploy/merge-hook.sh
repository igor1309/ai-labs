#!/usr/bin/env bash
# Redeploys the Session bot and web page on this Mac when trunk moves.
#
#   merge-hook.sh install           add the shared post-merge hook (once per clone)
#   merge-hook.sh plan <from> <to>  say whether that range would deploy; run nothing
#   merge-hook.sh run               called by post-merge after a merge or pull
#
# run acts only on trunk with ORIG_HEAD set, and only when agonara/session
# changed outside docs, design and *.md. It tests the checked-out module, then
# builds each command, keeps the old binary as <name>.prev, swaps in the new
# one and restarts its LaunchAgent if loaded. A failure leaves the old bot running; the merge itself
# never fails. Everything is logged to ~/Library/Logs/agonara-session/post-merge.log.
set -uo pipefail
export PATH=/opt/homebrew/bin:$PATH

module=agonara/session
home=${AGONARA_SESSION_HOME:-$HOME/.local/share/agonara-session}
logfile=$HOME/Library/Logs/agonara-session/post-merge.log

changed() { # from to: exit 0 if the range touches the bot's code
  git diff --name-only "$1" "$2" -- "$module" \
    ':(exclude)'"$module"'/docs' ':(exclude)'"$module"'/design' ':(exclude)*.md' |
    grep -q .
}

case "${1:-}" in
install)
  hooks=$(git rev-parse --git-common-dir)/hooks
  hook=$hooks/post-merge
  line='[ -x agonara/session/deploy/merge-hook.sh ] && agonara/session/deploy/merge-hook.sh run'
  if [[ -e "$hook" ]] && grep -qF "$line" "$hook"; then echo "already installed in $hook"; exit 0; fi
  [[ -e "$hook" ]] || printf '#!/bin/sh\n' >"$hook"
  printf '%s\n' "$line" >>"$hook"
  chmod +x "$hook"
  echo "installed in $hook"
  ;;
plan)
  [[ $# -eq 3 ]] || { echo "usage: $0 plan <from> <to>" >&2; exit 2; }
  if changed "$2" "$3"; then echo "would deploy agonara-session and agonara-web"; else echo "nothing to deploy"; fi
  ;;
run)
  [[ "$(git rev-parse --abbrev-ref HEAD)" == trunk ]] || exit 0
  git rev-parse -q --verify ORIG_HEAD >/dev/null || exit 0
  changed ORIG_HEAD HEAD || exit 0
  mkdir -p "$(dirname "$logfile")" "$home/bin"
  exec >>"$logfile" 2>&1
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) deploying $(git rev-parse --short HEAD)"
  cd "$module" || exit 0
  export GOCACHE="$home/gocache"
  if ! go test -count=1 ./...; then
    echo "tests FAILED; the old bot and page still run"
    exit 0
  fi
  for name in agonara-session agonara-web; do
    new=$home/bin/$name.new bin=$home/bin/$name
    if go build -o "$new" "./cmd/$name"; then
      [[ -e "$bin" ]] && cp -p "$bin" "$bin.prev"
      mv -f "$new" "$bin"
      label=gui/$(id -u)/ai.labs.$name
      launchctl print "$label" >/dev/null 2>&1 && launchctl kickstart -k "$label" && echo "deployed $name, restarted"
    else
      rm -f "$new"
      echo "build of $name FAILED; the old one still runs"
    fi
  done
  exit 0
  ;;
*)
  echo "usage: $0 install | plan <from> <to> | run" >&2; exit 2
  ;;
esac
