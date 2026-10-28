#!/bin/sh
# Gates a step's worktree: builds with tests, runs the bounded test run and
# bundles the app ad hoc. Each output goes to a file in the probe folder,
# never through a pipe, so the exit code decides; one line per part.
#
#   gate-step.sh
#
# Run from the step's worktree. The probe folder is $AUDELIN_PROBE, else
# ~/Library/Caches/audelin-probe: /tmp is cleared on restart (2026-10-27).

probe=${AUDELIN_PROBE:-$HOME/Library/Caches/audelin-probe}
mkdir -p "$probe"
name=$(git rev-parse --abbrev-ref HEAD) || exit 2
cd "$(git rev-parse --show-toplevel)/audelin/macos" || exit 2

swift build --build-tests > "$probe/$name-build.txt" 2>&1 \
    || { echo "FAIL build: $probe/$name-build.txt"; exit 1; }
echo "build ok"
../scripts/swift-test-bounded.sh 120 --skip-build > "$probe/$name-test.txt" 2>&1
status=$?
tail -1 "$probe/$name-test.txt"
[ $status = 0 ] || { echo "FAIL test: $probe/$name-test.txt"; exit 1; }
AUDELIN_SIGN_IDENTITY=- sh scripts/bundle.sh > "$probe/$name-bundle.txt" 2>&1 \
    || { echo "FAIL bundle: $probe/$name-bundle.txt"; exit 1; }
echo "bundle ok"
