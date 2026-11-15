#!/bin/sh
# Real-model check of the shipped Daily template (daily-notes QA S-1 to S-5).
# Needs a signed-in Claude CLI. Transcripts are Audelin Markdown exports; meeting text stays
# outside the repository. Usage: daily-content.sh <model> <transcript.md>...
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
src="$here/../Sources"
work=$(mktemp -d "${TMPDIR:-/tmp}/audelin-daily.XXXXXX")
trap 'rm -rf "$work"' EXIT
for module in TemplateFiles NotesGeneration SummaryRuntime; do
    (cd "$work" && swiftc -parse-as-library -enable-testing -emit-library -static -emit-module -module-name "$module" \
        -module-cache-path "$work/mc" "$src/$module"/*.swift -o "lib$module.a")
done
swiftc -parse-as-library -I "$work" -L "$work" -lTemplateFiles -lNotesGeneration -lSummaryRuntime \
    -module-cache-path "$work/mc" "$here/daily-content/main.swift" -o "$work/daily-content"
"$work/daily-content" "$@"
