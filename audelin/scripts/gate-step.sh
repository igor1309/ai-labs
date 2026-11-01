#!/bin/sh
# Gates a step's worktree: builds with tests, runs the bounded test run and
# bundles the app ad hoc. The real-device suites must run here: with
# AUDELIN_REQUIRE_DEVICES=1 a missing microphone or permission fails the
# test run instead of skipping. Each output goes to a file in the probe
# folder, never through a pipe, so the exit code decides; one line per part.
#
#   gate-step.sh
#
# Run from the step's worktree. The probe folder is $AUDELIN_PROBE, else
# ~/Library/Caches/audelin-probe: /tmp is cleared on restart (2026-10-27).

probe=${AUDELIN_PROBE:-$HOME/Library/Caches/audelin-probe}
mkdir -p "$probe"
name=$(git rev-parse --abbrev-ref HEAD) || exit 2
cd "$(git rev-parse --show-toplevel)/audelin/macos" || exit 2

for package in . App; do
    label=core
    [ "$package" = . ] || label=app
    (
        cd "$package" || exit 2
        swift build --build-tests > "$probe/$name-$label-build.txt" 2>&1 \
            || { echo "FAIL $label build: $probe/$name-$label-build.txt"; exit 1; }
        echo "$label build ok"
        AUDELIN_REQUIRE_DEVICES=1 sh "$(git rev-parse --show-toplevel)/audelin/scripts/swift-test-bounded.sh" 120 --skip-build > "$probe/$name-$label-test.txt" 2>&1
        status=$?
        tail -1 "$probe/$name-$label-test.txt"
        [ $status = 0 ] || { echo "FAIL $label test: $probe/$name-$label-test.txt"; exit 1; }
    ) || exit 1
done
AUDELIN_SIGN_IDENTITY=- sh scripts/bundle.sh > "$probe/$name-bundle.txt" 2>&1 \
    || { echo "FAIL bundle: $probe/$name-bundle.txt"; exit 1; }
echo "bundle ok"
