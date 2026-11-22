#!/bin/sh
# Puts a live run's backed-up notes files back into the calls folder exactly:
# each backed-up file is copied back, notes files the run added are removed,
# and every restored file is compared byte for byte with its backup.
# Usage: restore-live-backup.sh ~/.audelin/live-backups/<run>
set -eu
[ $# -eq 1 ] || { echo "Usage: restore-live-backup.sh <backup run folder>" >&2; exit 2; }
run=$1
calls=$(cat "$run/calls-folder")
for saved in "$run"/*/; do
    name=$(basename "$saved")
    target="$calls/$name"
    [ -d "$target" ] || { echo "FAIL: $target is missing" >&2; exit 1; }
    for f in "$target"/summary*.md "$target"/.summary-job.json; do
        [ -e "$f" ] || continue
        [ -e "$saved/$(basename "$f")" ] || rm "$f"
    done
    for f in "$saved"/summary*.md "$saved"/.summary-job.json; do
        [ -e "$f" ] || continue
        cp -p "$f" "$target/"
        cmp -s "$f" "$target/$(basename "$f")" || { echo "FAIL: $target/$(basename "$f") differs" >&2; exit 1; }
    done
    echo "RESTORED: $name"
done
