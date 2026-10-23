#!/bin/sh
# Runs `agister run <args>` in the current worktree, and runs it again only
# while it fails for a rate limit. Any other end stops at once: capacity
# too, which agister waits out itself, in the run's session.
#
#   agister-retry.sh [-n tries] [-u HHMM] [-o dir] -- <agister run args>
#
# Waits before the next try until a minute after the reset the rate
# limit's reason names ("resets 1pm", "resets 13:30"), else 30 min. A wait
# that would end past -u stops instead.
#
# Prints one line per try, for a watcher:
#   DONE   the run completed (whether it committed is the caller's to check)
#   RETRY  a rate limit; the run's leftovers are saved as a patch
#          in the output folder and cleared, as agister needs a clean worktree
#   STOP   anything else, with its reason; the worktree is left as it is
# Exits 0 on DONE, 1 on STOP, 2 when it cannot start.

tries=8
until=2400
out=/tmp/agister-retry
while getopts n:u:o: flag; do
  case $flag in
    n) tries=$OPTARG ;;
    u) until=$OPTARG ;;
    o) out=$OPTARG ;;
    *) exit 2 ;;
  esac
done
shift $((OPTIND - 1))
[ "$1" = -- ] && shift
[ $# -gt 0 ] || { echo "STOP: no agister run arguments"; exit 2; }
git rev-parse --show-toplevel > /dev/null 2>&1 || { echo "STOP: not in a git worktree"; exit 2; }
[ -z "$(git status --porcelain)" ] || { echo "STOP: worktree not clean before the first try"; exit 2; }
mkdir -p "$out" || exit 2
top=$(git rev-parse --show-toplevel)

# The run's result is the last JSON object in its output: status, class and reason.
result() {

  python3 -I -c '
import json, sys
text = open(sys.argv[1]).read()
start = text.rfind("\n{")
try:
    run = json.loads(text[start + 1:]) if start >= 0 else {}
except ValueError:
    run = {}
print(run.get("status") or "", run.get("class") or "", (run.get("reason") or "").replace("\n", " "), sep="\t")
' "$1"
}

# Seconds until a minute after the reset time a rate-limit reason names, or nothing.
reset_wait() {

  python3 -I -c '
import datetime, re, sys
m = re.search(r"resets\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", sys.argv[1], re.I)
if m:
    hour, minute, half = int(m.group(1)), int(m.group(2) or 0), (m.group(3) or "").lower()
    if half == "pm" and hour < 12:
        hour += 12
    if half == "am" and hour == 12:
        hour = 0
    now = datetime.datetime.now()
    at = now.replace(hour=hour % 24, minute=minute, second=0, microsecond=0)
    if at <= now:
        at += datetime.timedelta(days=1)
    print(int((at - now).total_seconds()) + 60)
' "$1"
}

n=0
while :; do
  n=$((n + 1))
  log=$out/run$n.out
  agister run "$@" > "$log" 2>&1
  code=$?
  fields=$(result "$log")
  status=$(printf '%s' "$fields" | cut -f1)
  class=$(printf '%s' "$fields" | cut -f2)
  reason=$(printf '%s' "$fields" | cut -f3)

  if [ "$status" = completed ]; then
    echo "DONE: try $n completed ($log)"
    exit 0
  fi
  [ "$class" = rate_limited ] || { echo "STOP: try $n exit $code status=${status:-none} class=${class:-none}: ${reason:-see $log}"; exit 1; }

  echo "RETRY: try $n $class: $reason"
  if [ -n "$(git status --porcelain)" ]; then
    git -C "$top" ls-files -z --others --exclude-standard | (cd "$top" && xargs -0 git add -N --)
    git -C "$top" diff > "$out/left$n.patch" && git -C "$top" apply -R "$out/left$n.patch" && git -C "$top" reset -q
    [ -z "$(git status --porcelain)" ] || { echo "STOP: could not clear try $n's leftovers"; exit 1; }
    echo "RETRY: try $n leftovers saved to $out/left$n.patch"
  fi
  [ $n -lt "$tries" ] || { echo "STOP: $tries tries spent"; exit 1; }
  wait=$(reset_wait "$reason")
  wait=${wait:-1800}
  wake=$(date -v +"${wait}"S +%H%M)
  [ "$wake" -lt "$until" ] && [ "$(date +%H%M)" -le "$wake" ] || { echo "STOP: the next try at $wake would be past $until"; exit 1; }
  echo "RETRY: try $((n + 1)) at $wake"
  sleep "$wait"
done
