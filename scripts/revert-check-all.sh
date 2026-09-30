#!/usr/bin/env bash
# Runs scripts/revert-check.py on every spec in agister/testdata/revert-checks,
# at most REVERT_CHECK_JOBS (default 3) at a time, from the repository root:
# more at once pushes Go tests past revert-check.py's 45s test timeout. Prints each spec's output under its
# name and fails, listing the failing specs, if any spec fails.
set -u
cd "$(dirname "$0")/.."
logs="$(mktemp -d)"
trap 'rm -rf "$logs"' EXIT
specs=(agister/testdata/revert-checks/*.spec)
jobs_max="${REVERT_CHECK_JOBS:-3}"
for spec in "${specs[@]}"; do
  while [ "$(jobs -rp | wc -l)" -ge "$jobs_max" ]; do
    wait -n
  done
  (scripts/revert-check.py "$spec" > "$logs/${spec##*/}" 2>&1; echo $? > "$logs/${spec##*/}.exit") &
done
wait
failed=()
for spec in "${specs[@]}"; do
  code="$(cat "$logs/${spec##*/}.exit")"
  echo "== $spec: exit $code"
  cat "$logs/${spec##*/}"
  [ "$code" = 0 ] || failed+=("$spec")
done
if [ ${#failed[@]} -gt 0 ]; then
  echo "revert checks failed: ${failed[*]}"
  exit 1
fi
echo "revert checks passed: ${#specs[@]} specs"
