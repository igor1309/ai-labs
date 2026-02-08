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
# - Refuses to overwrite any existing *non-symlink* in the worktree root.
#   (Fail-fast to avoid clobbering tracked files or local data.)
# - Skips git metadata entries at the shared-config root (e.g. .git*).
#
# Hardcoded conventions / expectations:
# - Worktrees live under:  /X/<repo>.worktrees/<worktree-name>
# - Shared config lives:   /X/<repo>.config
#
# Usage:
#   ./ensure-shared-config-links.sh <worktree-path>

WT_ROOT="${1:-}"
if [ -z "${WT_ROOT}" ]; then
  echo "usage: $0 <worktree-path>" >&2
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

WT_BASE="$(cd "${WT_ROOT}/.." && pwd)"           # .../<repo>.worktrees
WORKTREES_DIR="$(basename "${WT_BASE}")"         # <repo>.worktrees

# Enforce the hardcoded convention
if [[ "${WORKTREES_DIR}" != *.worktrees ]]; then
  echo "Refusing: parent dir is not '<repo>.worktrees': ${WT_BASE}" >&2
  exit 2
fi

REPO_ID="${WORKTREES_DIR%.worktrees}"            # <repo>
REPO_BASE="$(cd "${WT_BASE}/.." && pwd)"         # .../X
SHARED="${REPO_BASE}/${REPO_ID}.config"          # .../X/<repo>.config

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
SKIP_NAMES=(.DS_Store Thumbs.db .git .github .gitignore .gitattributes .gitmodules README.md)

should_skip_name() {
  local name="$1"
  for skip in "${SKIP_NAMES[@]}"; do
    [[ "${name}" == "${skip}" ]] && return 0
  done
  return 1
}

LINKED=0
SKIPPED=0

link_or_warn() {
  local target="$1"
  local linkpath="$2"
  local name="$(basename "${linkpath}")"

  if [ -e "${linkpath}" ] && [ ! -L "${linkpath}" ]; then
    echo "WARNING: skipping existing non-symlink: ${name}" >&2
    SKIPPED=$((SKIPPED + 1))
    return
  fi

  ln -sfn -- "${target}" "${linkpath}"
  echo "Linked: ${name} -> ${target}"
  LINKED=$((LINKED + 1))
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

echo "Done: ${LINKED} linked, ${SKIPPED} skipped."

if [ "${SKIPPED}" -gt 0 ]; then
  exit 2
fi
