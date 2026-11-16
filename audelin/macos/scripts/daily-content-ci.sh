#!/bin/sh
# The Daily content check, run by CI on the self-hosted Mac (LAB-1657).
# Frozen calls and their expectations live on the Mac, outside the repository, so
# meeting text never enters it:
#   $AUDELIN_DAILY_FIXTURES/calls/<call>.md   Audelin Markdown exports
#   $AUDELIN_DAILY_FIXTURES/expect.json       which rows each call must show (see daily-content-check.py)
# Makes notes with the app's default notes model, runs the deterministic checks, and with
# AUDELIN_DAILY_JUDGE=1 adds a report-only model-as-judge score that never gates.
# Usage: daily-content-ci.sh --out <dir>
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
fixtures=${AUDELIN_DAILY_FIXTURES:-"$HOME/Library/Application Support/Audelin Daily Content"}
[ "${1:-}" = "--out" ] && [ -n "${2:-}" ] || { echo "Usage: daily-content-ci.sh --out <dir>" >&2; exit 2; }
out=$2
if [ ! -f "$fixtures/expect.json" ] || ! ls "$fixtures/calls/"*.md >/dev/null 2>&1; then
    echo "No frozen calls in $fixtures (calls/*.md and expect.json)" >&2
    exit 1
fi
model=$(sed -n 's/.*primary: Runtime = .init(kind: "claudeCLI", model: "\([^"]*\)".*/\1/p' \
    "$here/../Sources/Preferences/NotesPreferences.swift" | head -n 1)
[ -n "$model" ] || { echo "Cannot read the default notes model" >&2; exit 1; }
mkdir -p "$out/notes"
cp "$fixtures/calls/"*.md "$out/notes/"
rm -f "$out/notes/"*.daily.*.md
echo "Model: $model" > "$out/identity.txt"

set +e
(cd "$out/notes" && sh "$here/daily-content.sh" "$model" *.md) > "$out/generate.log" 2>&1
generated=$?
python3 -I "$here/daily-content-check.py" "$fixtures/expect.json" "$out/notes" --report "$out/report.md" > "$out/check.log"
checked=$?
cat "$out/generate.log" "$out/check.log"
# The notes are one model sample each: a call that fails gets one new sample, and the
# report says so. A row that fails twice is a real regression.
retried=$(sed -n 's/^FAIL \([^ ]*\) .*/\1/p' "$out/check.log" | sort -u)
if [ "$checked" -ne 0 ] && [ -n "$retried" ]; then
    mkdir -p "$out/first"
    for call in $retried; do mv "$out/notes/$call".daily.*.md "$out/first/" 2>/dev/null; done
    (cd "$out/notes" && sh "$here/daily-content.sh" "$model" $(for call in $retried; do printf '%s.md ' "$call"; done)) >> "$out/generate.log" 2>&1
    generated=$?
    python3 -I "$here/daily-content-check.py" "$fixtures/expect.json" "$out/notes" --report "$out/report.md"
    checked=$?
    { echo; echo "Retried once after a first-sample failure: $(echo $retried)."; } >> "$out/report.md"
fi
set -e
{ echo; echo "Model: \`$model\`."; } >> "$out/report.md"

if [ "${AUDELIN_DAILY_JUDGE:-0}" = 1 ]; then
    {
        echo; echo "### Agreed vs suggested, model as judge (report only)"; echo
        echo "| Call | Score |"; echo "|---|---|"
        for call in "$out/notes/"*.md; do
            case $call in *.daily.*) continue ;; esac
            name=$(basename "$call" .md)
            notes=$(ls "$out/notes/$name".daily.*.md 2>/dev/null | head -n 1)
            [ -n "$notes" ] || continue
            score=$( { printf 'Transcript:\n'; cat "$call"; printf '\n\nNotes:\n'; cat "$notes"; } |
                claude -p --model "$model" "Score 0-10 how correctly the notes label each item agreed or suggested against what the transcript shows: agreed only when it was confirmed in the call. Reply with the number, a space, and one short sentence." 2>/dev/null |
                tr '\n|' '  ' | cut -c1-200 ) || score="judge failed"
            echo "| $name | ${score:-judge failed} |"
        done
    } >> "$out/report.md" || true
fi

# Notes are meeting text: they stay in $out on the Mac and are not uploaded.
[ "$generated" -eq 0 ] && [ "$checked" -eq 0 ]
