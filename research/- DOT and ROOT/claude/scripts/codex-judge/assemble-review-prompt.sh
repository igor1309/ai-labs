#!/usr/bin/env bash
# Assemble a codex-judge review prompt from the fixed template.
#
#   assemble-review-prompt.sh --out <findings-path> [--path P]... [--range A..B] [--repo DIR]
#
# Scope is named by PATHS and GIT RANGES only. There is no argument that injects
# free text, by design: a prompt the orchestrator can write prose into is a
# prompt the orchestrator can steer, and a steered review returns its author's
# conclusions wearing a reviewer's authority.
#
# Every --path must exist; a scope naming something absent is a typo, and a
# review of a scope you cannot account for is worthless.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$HERE/review-template.md"

OUT=""
REPO=""
RANGE=""
PATHS=()

while [ $# -gt 0 ]; do
	case "$1" in
		--out)   OUT="${2:-}"; shift 2 || true ;;
		--path)  PATHS+=("${2:-}"); shift 2 || true ;;
		--range) RANGE="${2:-}"; shift 2 || true ;;
		--repo)  REPO="${2:-}"; shift 2 || true ;;
		*) echo "unknown argument: $1" >&2
		   echo "usage: assemble-review-prompt.sh --out <findings-path> [--path P]... [--range A..B] [--repo DIR]" >&2
		   exit 2 ;;
	esac
done

[ -f "$TEMPLATE" ] || { echo "missing template: $TEMPLATE" >&2; exit 2; }
[ -n "$OUT" ] || { echo "--out is required" >&2; exit 2; }
if [ "${#PATHS[@]}" -eq 0 ] && [ -z "$RANGE" ]; then
	echo "name a scope: at least one --path, or a --range" >&2
	exit 2
fi

BLOCK="$(mktemp)"
trap 'rm -f "$BLOCK"' EXIT

for p in ${PATHS+"${PATHS[@]}"}; do
	[ -e "$p" ] || { echo "path does not exist: $p" >&2; exit 1; }
	printf -- '- `%s`\n' "$(cd "$(dirname "$p")" && pwd)/$(basename "$p")" >> "$BLOCK"
done

if [ -n "$RANGE" ]; then
	repo_dir="${REPO:-$PWD}"
	git -C "$repo_dir" rev-parse --quiet --verify "${RANGE%%..*}" >/dev/null 2>&1 \
		|| { echo "range base not resolvable in $repo_dir: $RANGE" >&2; exit 1; }
	printf -- '- the diff `git -C %s diff %s`, which you read yourself\n' \
		"$(cd "$repo_dir" && pwd)" "$RANGE" >> "$BLOCK"
fi

awk -v blockfile="$BLOCK" -v outpath="$OUT" '
	$0 == "{{ARTIFACTS}}" {
		while ((getline line < blockfile) > 0) print line
		close(blockfile)
		next
	}
	$0 == "{{OUTPUT}}" { print "`" outpath "`"; next }
	{ print }
' "$TEMPLATE"
