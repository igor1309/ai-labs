---
date: 2026-02-12
model: claude-opus-4-6
description: "Fix naming mismatch between wt.sh and ensure-shared-config-links.sh"
---

# Fix naming mismatch between wt.sh and ensure-shared-config-links.sh

## Problem

The two tools use incompatible directory naming conventions and cannot work together.

### `wt.sh` convention

```
<parent>/<repo>-worktrees/wt-<prefix>-<name>
```

- Container: `ai-coder-worktrees` (hyphen before `worktrees`)
- Worktree: `ai-coder-worktrees/wt-feature-auth`

### `ensure-shared-config-links.sh` convention

```
<parent>/<repo>.worktrees/<worktree-name>
```

- Container: `ai-coder.worktrees` (dot before `worktrees`)
- Shared config: `ai-coder.config`

### Why they break

1. The glob guard `[[ "${WORKTREES_DIR}" != *.worktrees ]]` rejects `ai-coder-worktrees` because it doesn't end with `.worktrees`
2. Even if bypassed, the suffix strip `${WORKTREES_DIR%.worktrees}` would not match, leaving `REPO_ID` as the full `ai-coder-worktrees` and deriving `SHARED` as `ai-coder-worktrees.config`

### Affected files

- `tools/wt/wt.sh:20` — `worktree_base_directory="${repository_parent_directory}/${repository_name}-worktrees"`
- `tools/ensure-shared-config-links/ensure-shared-config-links.sh:44` — `if [[ "${WORKTREES_DIR}" != *.worktrees ]]`
- `tools/ensure-shared-config-links/ensure-shared-config-links.sh:49` — `REPO_ID="${WORKTREES_DIR%.worktrees}"`

## Decision: which convention to adopt

### Option A: change `wt.sh` to use dots

Change `wt.sh` to produce `<repo>.worktrees` instead of `<repo>-worktrees`. Leaves `ensure-shared-config-links.sh` untouched.

- Pros: dot-separated names visually separate the repo name from the suffix, reducing ambiguity for repos whose names contain hyphens (e.g., `my-app-worktrees` — is the repo `my-app` or `my`?)
- Cons: breaks existing worktree directories created with the hyphen convention; users must rename or recreate

### Option B: change `ensure-shared-config-links.sh` to use hyphens

Update the guard, suffix strip, and shared config derivation to expect `<repo>-worktrees` and derive `<repo>-config`.

- Pros: no churn on existing worktrees
- Cons: hyphen ambiguity remains for repos with hyphens in their names

### Option C: support both conventions

Detect whether the parent ends with `.worktrees` or `-worktrees` and derive the shared config path accordingly.

- Pros: maximum compatibility
- Cons: more code, two conventions to document

## Steps

1. Decide on convention (A, B, or C)
2. Update the chosen script(s)
3. Update README.md in both `tools/wt/` and `tools/ensure-shared-config-links/`
4. Add a call to `ensure-shared-config-links.sh` at the end of `wt.sh` so worktrees get config links on creation
5. Test: create a fresh worktree with `wt.sh`, verify `ensure-shared-config-links.sh` runs and symlinks appear
