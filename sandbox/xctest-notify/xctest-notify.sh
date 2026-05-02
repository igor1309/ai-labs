#!/usr/bin/env bash
set -euo pipefail

PROJECT="Vortex/Vortex.xcodeproj"
SCHEME="CI"
DESTINATION="platform=iOS Simulator,id=98E6E9C2-5C96-4D61-81E1-FE53C5F0DB6F,arch=arm64"
SOUND="/System/Library/Sounds/Glass.aiff"

usage() {
  cat <<'EOF'
Usage:
  xctest-notify.sh <TestID> [<TestID> ...]

Examples:
  xctest-notify.sh VortexTests/LatestOutsidePresentationBuilderTests
  xctest-notify.sh \
    VortexTests/LatestOutsidePresentationBuilderTests \
    VortexTests/SomeOtherTests \
    VortexTests/AnotherTestCase/testSomething
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 1 ]]; then
  usage
  exit 2
fi

only_testing_args=()
for t in "$@"; do
  t="${t#"${t%%[![:space:]]*}"}"
  t="${t%"${t##*[![:space:]]}"}"
  [[ -z "$t" ]] && continue
  only_testing_args+=("-only-testing:${t}")
done

# Run command (capture correct pipeline status)
set +e
xcodebuild test \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -destination "$DESTINATION" \
  "${only_testing_args[@]}" \
  2>&1 | xcsift --quiet
status=${PIPESTATUS[0]}
set -e

subtitle=$([[ $status -eq 0 ]] && echo "SUCCESS" || echo "FAIL")
message="exit code: $status"

osascript -e "display notification \"${message}\" with title \"xcodebuild test\" subtitle \"${subtitle}\"" >/dev/null 2>&1 || true
afplay "$SOUND" >/dev/null 2>&1 || true

exit "$status"
