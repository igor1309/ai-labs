#!/usr/bin/env bash
# maestro-flows-snapshot.sh — regenerate the maestro-flows drift snapshot.
#
# ADR-001 (windowed per-subfolder review) Decision 8 / M8: discovery from the
# working tree is AUTHORITATIVE; this committed snapshot is the thin baseline the
# sequencer compares against to DETECT DRIFT (a subfolder added or removed since
# the snapshot is reported, never silently skipped). It is NOT the cycle's frozen
# scope — the wrapper freezes that at cycle start at runtime.
#
# Run from a checkout of igor1309/ios.config (default $PWD), or pass its path:
#   ./maestro-flows-snapshot.sh [/path/to/ios.config] > maestro-flows-manifest.txt
# Then commit the regenerated maestro-flows-manifest.txt — committing IS the
# acknowledgement of the drift (a legitimate flow-subfolder change).
#
# SNAPSHOT_DATE overrides the date stamp (keeps regeneration deterministic in CI).
set -euo pipefail

REPO="${1:-.}"
cd "$REPO"
FLOWS_DIR=.maestro/flows

[ -d "$FLOWS_DIR" ] || { echo "error: $FLOWS_DIR not found in $(pwd)" >&2; exit 1; }

commit=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
stamp="${SNAPSHOT_DATE:-$(date -u +%Y-%m-%d)}"

{
  echo "# maestro-flows drift snapshot — thin committed baseline (ADR-001 Decision 8, M8)."
  echo "# Source: igor1309/ios.config ${FLOWS_DIR}/ @ ${commit}, snapshot ${stamp}."
  echo "# Format: <flow_count> <subfolder>  — ordered smallest-first (Decision 6)."
  echo "# Drift key = the SUBFOLDER SET; an added/removed subfolder is reported as drift."
  echo "# Counts are advisory — the sequencer recomputes them at runtime for ordering"
  echo "# and the M5 over-budget split check. Regenerate with maestro-flows-snapshot.sh."
  for d in "$FLOWS_DIR"/*/; do
    [ -d "$d" ] || continue
    n=$(find "$d" -maxdepth 1 \( -name '*.yaml' -o -name '*.yml' \) 2>/dev/null | wc -l | tr -d ' ')
    printf '%s %s\n' "$n" "$(basename "$d")"
  done | sort -n -k1,1 -k2,2
}
