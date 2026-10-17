#!/usr/bin/env bash
# spec-review.sh <out-dir> <spec file>...: one spec review round of the
# committed spec at HEAD, Codex and Claude on the same prompt, both
# read-only. Run from the root of the branch's worktree. Writes
# <out-dir>/spec-review-<n>-prompt.md, -codex.md and -claude.md, with
# their logs; <n> counts up from the rounds already in <out-dir>.
set -euo pipefail
[[ $# -ge 2 ]] || { echo "usage: $0 <out-dir> <spec file>..." >&2; exit 2; }
out_dir=$1; shift
mkdir -p "$out_dir"
wt=$(git rev-parse --show-toplevel)
commit=$(git rev-parse --short HEAD)

n=0
for f in "$out_dir"/spec-review-*; do
  [[ -e $f ]] || continue
  m=${f#"$out_dir/spec-review-"}; m=${m%%-*}
  [[ $m =~ ^[0-9]+$ ]] && (( m > n )) && n=$m
done
out="$out_dir/spec-review-$((n + 1))"

cat > "$out-prompt.md" <<EOF
Review the spec in the git worktree $wt, at commit $commit.

The spec is the files $*.

Context: AGENTS.md at the repo root and rexlab/AGENTS.md.

Report your findings, each with its file and line, and your verdict.
EOF
echo "round $((n + 1)) at $commit: $out-prompt.md"

codex exec -s read-only -C "$wt" -o "$out-codex.md" - < "$out-prompt.md" > "$out-codex.log" 2>&1 &
codex_pid=$!
(cd "$wt" && claude -p --permission-mode default \
  --allowedTools "Read" "Grep" "Glob" "Bash(git show:*)" "Bash(git log:*)" "Bash(git diff:*)" \
  --disallowedTools "Edit" "Write" "NotebookEdit" "Agent" \
  < "$out-prompt.md" > "$out-claude.md" 2> "$out-claude.log") &
claude_pid=$!

status=0
wait $codex_pid || { echo "codex failed: $out-codex.log"; status=1; }
wait $claude_pid || { echo "claude failed: $out-claude.log"; status=1; }
echo "codex:  $out-codex.md"
echo "claude: $out-claude.md"
exit $status
