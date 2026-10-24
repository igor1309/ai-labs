#!/bin/sh
# Checks that a candidate's new or changed tests fail without its code,
# so a build's red evidence never rests on what the builder saved.
#
#   red-check.sh <base> <candidate>
#
# In a throwaway worktree at the candidate, it runs the suite twice: once
# as is, then with `audelin/macos/Sources` put back as it was at the base.
# A test is new or changed when its body differs from the base's. Each
# one must pass on the candidate and fail (or run out of time) on the
# base's code. A test that passes on both proves nothing the base lacked.
#
# Prints one line per changed test (RED, GREEN-ON-BASE, FAILS-ON-CANDIDATE),
# then the verdict:
#   PASS          every changed test passes on the candidate, fails on the base
#   FAIL          a changed test passes on the base or fails on the candidate
#   INCONCLUSIVE  the tests do not build against the base's code, so no test
#                 was run red; planted breaks have to show the tests can fail
# Exits 0 on PASS, 1 on FAIL, 2 on INCONCLUSIVE, 3 when it cannot start.
# Logs are kept in the output folder (-o, default /tmp/red-check).

out=/tmp/red-check
while getopts o: flag; do
  case $flag in
    o) out=$OPTARG ;;
    *) exit 3 ;;
  esac
done
shift $((OPTIND - 1))
[ $# -eq 2 ] || { echo "usage: red-check.sh [-o dir] <base> <candidate>" >&2; exit 3; }
base=$(git rev-parse --verify -q "$1^{commit}") || { echo "no commit $1" >&2; exit 3; }
candidate=$(git rev-parse --verify -q "$2^{commit}") || { echo "no commit $2" >&2; exit 3; }
pkg=audelin/macos
mkdir -p "$out"
tree=$(mktemp -d /tmp/red-check-tree.XXXXXX)
rmdir "$tree"
git worktree add -q --detach "$tree" "$candidate" || exit 3
trap 'git worktree remove --force "$tree"' EXIT

# The new or changed tests: each @Test function whose body differs from
# the base's, in the test files the candidate touched.
git diff --name-only "$base" "$candidate" -- "$pkg/Tests" | grep '\.swift$' > "$out/files"
python3 -I - "$base" "$candidate" "$out/files" > "$out/changed" <<'EOF' || exit 3
import re, subprocess, sys
base, candidate, files = sys.argv[1], sys.argv[2], open(sys.argv[3]).read().split()

def tests(rev, path):
    shown = subprocess.run(["git", "show", f"{rev}:{path}"], capture_output=True, text=True)
    if shown.returncode != 0:
        return {}
    text, found = shown.stdout, {}
    for match in re.finditer(r"@Test\b[^\n]*(?:\n[^\n]*?)??\bfunc\s+(\w+)", text):
        start = text.index("{", match.end())
        depth, end = 0, start
        for end in range(start, len(text)):
            depth += {"{": 1, "}": -1}.get(text[end], 0)
            if depth == 0:
                break
        found[match.group(1)] = text[match.start():end + 1]
    return found

for path in files:
    old, new = tests(base, path), tests(candidate, path)
    for name, body in new.items():
        if old.get(name) != body:
            print(name)
EOF
[ -s "$out/changed" ] || { echo "no new or changed tests"; echo "FAIL"; exit 1; }

run() {  # run <log>: the suite in the throwaway worktree, its status kept
  (cd "$tree/$pkg" && timeout 500 swift test > "$1" 2>&1)
}
# A test that takes arguments prints no line of its own when it passes,
# only one when it starts and one per failing case, so a test that started
# in a run that ended, and failed nowhere, passed.
outcome() {  # outcome <log> <test>: passed, failed, or none
  if grep -Eq "(Test|to) $2\(.*\) (failed|recorded an issue)" "$1"; then
    echo failed
  elif grep -Eq "Test $2\(.*\) started" "$1" && grep -q "Test run with" "$1"; then
    echo passed
  else
    echo none
  fi
}

run "$out/candidate.log"
rm -rf "$tree/$pkg/Sources"
git -C "$tree" checkout -q "$base" -- "$pkg/Sources" 2>/dev/null
run "$out/base.log"
based=$?

verdict=PASS
if [ $based -ne 0 ] && ! grep -q "Test run with" "$out/base.log"; then
  verdict=INCONCLUSIVE
fi
while read -r name; do
  on_candidate=$(outcome "$out/candidate.log" "$name")
  on_base=$(outcome "$out/base.log" "$name")
  if [ "$on_candidate" != passed ]; then
    echo "FAILS-ON-CANDIDATE $name"; verdict=FAIL
  elif [ "$on_base" = passed ]; then
    echo "GREEN-ON-BASE $name"; verdict=FAIL
  elif [ "$verdict" != INCONCLUSIVE ]; then
    echo "RED $name ($on_base on the base)"
  fi
done < "$out/changed"
[ "$verdict" = INCONCLUSIVE ] && echo "the tests do not build against the base's code; see $out/base.log"
echo "$verdict"
case $verdict in PASS) exit 0 ;; FAIL) exit 1 ;; *) exit 2 ;; esac
