# Runs Audelin's Swift tests outside any agent's sandbox: the packages, then
# the preview apps, into one log. Each is compiled first, then its tests
# run under a two-minute limit that names the tests a hang left unfinished.
# The exit code is the gate; the tail of the output is what a repair is
# given.
log=$(mktemp)
bounded="$PWD/audelin/scripts/swift-test-bounded.sh"
code=0
for package in audelin/macos audelin/macos/App audelin/macos/PreviewApps; do
  echo "== $package" >> "$log"
  (cd "$package" && timeout 500 swift build --build-tests && sh "$bounded" 120) >> "$log" 2>&1
  code=$?
  [ "$code" -eq 0 ] || break
done
grep -E 'error:|recorded an issue|failed after|Test run with|^  [A-Za-z].*/.*:[0-9]+:[0-9]+$' "$log" | tail -60
tail -20 "$log"
rm -f "$log"
exit "$code"
