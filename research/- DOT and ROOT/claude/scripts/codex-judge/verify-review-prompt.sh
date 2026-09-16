#!/usr/bin/env bash
# Prove a codex-judge review prompt was not hand-written.
#
#   verify-review-prompt.sh <prompt-file>
#
# Fails if any line of the prompt traces to neither the review template nor a
# path the assembler generates. Orchestrator framing — a summary of what you
# expect, a menu of acceptable answers, an "out of scope for this pass" block,
# a named failure mode you want flagged — appears as lines in the prompt and in
# no source, and is rejected before dispatch.
#
# This checks PROVENANCE, not neutrality: it proves each line came from the
# template or a named path. It cannot prove a named artifact is unbiased. Keep
# the artifacts you point at reviewable by the user for that half.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$HERE/review-template.md"
PROMPT="${1:-}"

[ -n "$PROMPT" ] || { echo "usage: verify-review-prompt.sh <prompt-file>" >&2; exit 2; }
for f in "$TEMPLATE" "$PROMPT"; do
	[ -f "$f" ] || { echo "missing file: $f" >&2; exit 2; }
done

# An empty or truncated prompt trivially "contains no foreign lines". Passing it
# would be the worst failure available: the check that exists to catch bad
# prompts reporting OK on a broken one. The template's two placeholder lines are
# replaced by at least one line each, so the prompt is never shorter.
tpl_lines=$(grep -cv '^$' "$TEMPLATE")
prm_lines=$(grep -cv '^$' "$PROMPT")
if [ "$prm_lines" -lt "$tpl_lines" ]; then
	echo "TRUNCATED — $PROMPT has $prm_lines non-blank lines, the template has $tpl_lines." >&2
	echo "assembly failed or the prompt was overwritten. do not dispatch it." >&2
	exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Allowed: every template line except the two placeholders, plus any line the
# assembler generates in their place — a markdown path bullet, the diff bullet,
# or the backticked findings path.
grep -vx -e '{{ARTIFACTS}}' -e '{{OUTPUT}}' "$TEMPLATE" \
	| sed 's/[[:space:]]*$//' | sort -u > "$WORK/allowed"

sed 's/[[:space:]]*$//' "$PROMPT" | sort -u > "$WORK/actual"

comm -23 "$WORK/actual" "$WORK/allowed" \
	| grep -v '^$' \
	| grep -vE '^- `/.+`$' \
	| grep -vE '^- the diff `git -C /.+ diff .+`, which you read yourself$' \
	| grep -vE '^`/.+`$' \
	> "$WORK/orphans" || true

if [ -s "$WORK/orphans" ]; then
	echo "CONTAMINATED — $(wc -l < "$WORK/orphans" | tr -d ' ') line(s) trace to no source:" >&2
	echo >&2
	cat "$WORK/orphans" >&2
	echo >&2
	echo "Neither the template nor the assembler produces these." >&2
	echo "If the text is yours, delete it and ask the user instead." >&2
	exit 1
fi

echo "OK — every line of $PROMPT traces to the review template or an assembled path."
