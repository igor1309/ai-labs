#!/bin/bash
# Export Settings content offscreen, without launching the production app.
set -euo pipefail
usage() { echo 'usage: rehearsal.sh all --out DIRECTORY' >&2; exit 64; }
[[ $# == 3 && $1 == all && $2 == --out && -n $3 ]] || usage
mkdir -p "$3"
out="$(cd "$3" && pwd)"
staging="$(mktemp -d "$out/.settings-rehearsal.XXXXXX")"
trap 'rm -rf "$staging"' EXIT
cd "$(dirname "$0")/.."
status=0
CLANG_MODULE_CACHE_PATH=/tmp/codex-swift/clang AUDELIN_SNAPSHOTS="$staging" \
  timeout 600 swift test --disable-sandbox \
  --cache-path /tmp/codex-swift/cache --config-path /tmp/codex-swift/config \
  --security-path /tmp/codex-swift/security \
  --filter SettingsViewRenderTests/everyPreviewFillsTheWindow > "$out/rehearsal.log" 2>&1 || status=$?
if [[ $status != 0 ]]; then
  echo "Settings rehearsal failed (exit $status): $out/rehearsal.log" >&2
  exit "$status"
fi
count=0
for state in release debug confirm-move moving move-failed during-recording \
  summaries-off summaries-on summaries-local summaries-invalid summaries-unavailable \
  summaries-validating summaries-saving summaries-save-failed summaries-saved \
  summaries-loading summaries-load-failed; do
  for appearance in light dark; do
    file="$staging/settings-$state-$appearance.png"
    [[ -s "$file" ]] || { echo "Missing Settings export: $file" >&2; exit 1; }
    count=$((count + 1))
  done
done
for file in "$staging"/*.png; do mv "$file" "$out/"; done
echo "Exported $count Settings previews to $out"
