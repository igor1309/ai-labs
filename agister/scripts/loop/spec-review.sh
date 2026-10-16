#!/usr/bin/env bash
# spec-review.sh [commit]: one spec review round, Codex and Claude on the
# same prompt, rendered from spec-review-prompt.tmpl; nothing else goes in.
# Writes spec-review-<n>-prompt.md, -codex.md, -claude.md and their logs.
set -euo pipefail
bin=$(cd "$(dirname "$0")" && pwd)
# The branch's directory: $LOOP_DIR, or /tmp/<the current branch>.
dir=${LOOP_DIR:-/tmp/$(git branch --show-current)}
[[ -f $dir/config.sh ]] || { echo "no $dir/config.sh" >&2; exit 2; }
source "$dir/config.sh"
commit=$(git -C "$WT" rev-parse --short "${1:-HEAD}")
n=$("$bin/next-round.sh" "$dir" spec-review)
out="$dir/spec-review-$n"
sed -e "s|{{WT}}|$WT|g" -e "s|{{COMMIT}}|$commit|g" "$bin/spec-review-prompt.tmpl" > "$out-prompt.md"
echo "round $n at $commit: $out-prompt.md"

codex exec -s read-only -C "$WT" -o "$out-codex.md" - < "$out-prompt.md" > "$out-codex.log" 2>&1 &
codex_pid=$!
(cd "$WT" && claude -p --permission-mode default \
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
