#!/usr/bin/env bash
set -euo pipefail

# ensure-shared-config-links.sh
#
# What this does:
# - Given a git worktree directory, derives a shared config directory at:
#     ../<repo>.config
#   alongside:
#     ../<repo>.worktrees/<worktree-name>
#
# - For every direct child entry inside <shared> (files and directories),
#   ensures there is a symlink in the worktree root with the same name:
#     <worktree>/<name> -> <shared>/<name>
#
# - Warns and skips any existing *non-symlink* in the worktree root
#   (continues processing remaining entries).
# - Skips git metadata entries at the shared-config root (e.g. .git*).
# - Warns about managed links the repo does not git-ignore (they would show as
#   untracked in every `git status`). Advisory only: it never edits git state
#   and never changes the exit code.
#
# Shared-config resolution (in precedence order):
# 1. explicit second argument, if given
# 2. convention layout:  /X/<repo>.worktrees/<name>  ->  /X/<repo>.config
# 3. git fallback: derive from the repo's main worktree (handles non-convention
#    layouts such as codex worktrees at /X/.codex/worktrees/<id>/<repo>)
#
# Usage:
#   ./ensure-shared-config-links.sh <worktree-path> [shared-config-dir]

WT_ROOT="${1:-}"
SHARED_ARG="${2:-}"   # optional: explicit shared-config dir (overrides derivation)
if [ -z "${WT_ROOT}" ]; then
  echo "usage: $0 <worktree-path> [shared-config-dir]" >&2
  exit 64
fi

# Normalize to absolute path
WT_ROOT="$(cd "${WT_ROOT}" && pwd)"

# Refuse obvious misuse: passing the worktrees container itself
if [[ "$(basename "${WT_ROOT}")" == *.worktrees ]]; then
  echo "Refusing: path appears to be the worktrees container, not a worktree: ${WT_ROOT}" >&2
  exit 2
fi

# Validate this is a git working tree
if ! git -C "${WT_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git working tree: ${WT_ROOT}" >&2
  exit 2
fi

# Resolve the shared-config dir. Precedence:
#   1. explicit argument (normalized to absolute)
#   2. convention layout: .../<repo>.worktrees/<name> -> .../<repo>.config
#   3. fallback: derive from git's main worktree (handles non-convention layouts,
#      e.g. codex worktrees at .../.codex/worktrees/<id>/<repo>)
if [ -n "${SHARED_ARG}" ]; then
  SHARED="$(cd "${SHARED_ARG}" && pwd)"
else
  WT_BASE="$(cd "${WT_ROOT}/.." && pwd)"
  WORKTREES_DIR="$(basename "${WT_BASE}")"
  if [[ "${WORKTREES_DIR}" == *.worktrees ]]; then
    REPO_ID="${WORKTREES_DIR%.worktrees}"          # <repo>
    REPO_BASE="$(cd "${WT_BASE}/.." && pwd)"       # .../X
    SHARED="${REPO_BASE}/${REPO_ID}.config"        # .../X/<repo>.config
  else
    MAIN_WT="$(cd "${WT_ROOT}" && cd "$(git rev-parse --git-common-dir)/.." && pwd)"  # .../<repo>
    SHARED="${MAIN_WT}.config"                     # .../<repo>.config
  fi
fi

# Extra safety invariant:
# Refuse if SHARED resolves inside WT_ROOT (prevents self-referential / recursive layouts).
case "${SHARED}/" in
  "${WT_ROOT}/"*)
    echo "Refusing: shared config path is inside worktree (layout would be self-referential):" >&2
    echo "  worktree: ${WT_ROOT}" >&2
    echo "  shared:   ${SHARED}" >&2
    exit 2
    ;;
esac

# Ensure shared dir exists
mkdir -p "${SHARED}"

# Items to skip (direct children names only). Keep this list short and obvious.
SKIP_NAMES=(.DS_Store Thumbs.db .git .github .gitignore .gitattributes .gitmodules README.md TODO.md docs)

should_skip_name() {
  local name="$1"
  for skip in "${SKIP_NAMES[@]}"; do
    [[ "${name}" == "${skip}" ]] && return 0
  done
  return 1
}

LINKED=0
SKIPPED=0
MANAGED=()   # names of links this run owns (newly created or already correct)

link_or_warn() {
  local target="$1"
  local linkpath="$2"
  local name="$(basename "${linkpath}")"

  if [ -e "${linkpath}" ] && [ ! -L "${linkpath}" ]; then
    echo "WARNING: skipping existing non-symlink: ${name}" >&2
    SKIPPED=$((SKIPPED + 1))
    return
  fi

  MANAGED+=("${name}")

  if [ -L "${linkpath}" ] && [ "$(readlink "${linkpath}")" = "${target}" ]; then
    return
  fi

  ln -sfn -- "${target}" "${linkpath}"
  echo "Linked: ${name} -> ${target}"
  LINKED=$((LINKED + 1))
}

# Report managed links that git does not ignore.
#
# The links are shared config, never repository content, so each one needs a
# matching pattern in the repo's exclude file or it shows up as untracked in
# every `git status`. Nothing else creates those patterns, and a missing one is
# silent — this run is the moment to notice. Advisory only: it reports, never
# edits git state, and never changes the exit code.
report_unignored_links() {
  [ "${#MANAGED[@]}" -gt 0 ] || return 0

  local exclude_file unignored=()
  exclude_file="$(cd "${WT_ROOT}" && cd "$(git rev-parse --git-common-dir)" && pwd)/info/exclude"

  local name
  for name in "${MANAGED[@]}"; do
    # Ignored already — nothing to report.
    git -C "${WT_ROOT}" check-ignore -q -- "${name}" && continue
    # Tracked content is legitimately un-ignored; only untracked links are noise.
    git -C "${WT_ROOT}" ls-files --error-unmatch -- "${name}" >/dev/null 2>&1 && continue
    unignored+=("${name}")
  done

  [ "${#unignored[@]}" -gt 0 ] || return 0

  echo "WARNING: ${#unignored[@]} shared-config link(s) are not git-ignored and will appear as untracked:" >&2
  printf '  %s\n' "${unignored[@]}" >&2
  echo "Add them to ${exclude_file} :" >&2
  printf '  %s\n' "${unignored[@]}" >&2
}

# Link every direct child of SHARED into WT_ROOT
shopt -s nullglob dotglob

for src in "${SHARED}"/*; do
  name="$(basename "${src}")"

  if should_skip_name "${name}"; then
    continue
  fi

  link_or_warn "${src}" "${WT_ROOT}/${name}"
done

report_unignored_links

echo "Done: ${LINKED} linked, ${SKIPPED} skipped."

if [ "${SKIPPED}" -gt 0 ]; then
  exit 2
fi
