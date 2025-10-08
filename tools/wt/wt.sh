# ~/bin/wt  (chmod +x ~/bin/wt; ensure ~/bin in PATH)
#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<EOF
Usage: wt [--type feat|fix|chore|rel] [--base <remote/branch>] <name>
Examples:
  wt auth          # => type=feat, base=origin/trunk, branch=feature/auth, dir=../wt-feature-auth
  wt --type fix crash-login --base origin/main
EOF
}

type="feat"
base="origin/trunk"
name=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --type|-t) type="${2:-}"; shift 2 ;;
    --base|-b) base="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) name="${1}"; shift ;;
  esac
done

[[ -z "${name}" ]] && { usage; exit 2; }
git rev-parse --is-inside-work-tree >/dev/null || { echo "Not inside a git repo"; exit 3; }

case "$type" in
  feat) prefix="feature" ;;
  fix|hotfix) prefix="fix" ;;
  chore) prefix="chore" ;;
  rel) prefix="release" ;;
  *) echo "Unknown --type: $type"; exit 4 ;;
esac

dir="../wt-${prefix}-${name}"
branch="${prefix}/${name}"

[[ -e "$dir" ]] && { echo "Path exists: $dir"; exit 5; }
git fetch --all --prune
git worktree add -b "$branch" "$dir" "$base"
echo "✅ Created $dir on $branch (base: $base)"
echo "Next:"
echo "  cd $dir"
echo "  # work, commit, then first push sets upstream"
echo "  git push -u origin $branch"