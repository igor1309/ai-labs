# Runs Audelin's Swift tests outside any agent's sandbox: the package, then
# the preview apps, into one log. The exit code is the gate; the tail of
# the output is what a repair is given.
log=$(mktemp)
(cd audelin/macos && timeout 500 swift test) > "$log" 2>&1
code=$?
if [ "$code" -eq 0 ]; then
  (cd audelin/macos/PreviewApps && timeout 500 swift test) >> "$log" 2>&1
  code=$?
fi
grep -E 'error:|recorded an issue|failed after|Test run with' "$log" | tail -60
tail -20 "$log"
rm -f "$log"
exit "$code"
