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

## Verified: symlinks work end-to-end with Claude Code

Tested in `ios.worktrees/feature-DBSNEW-15276_TransGran` (Feb 2026, Claude Code v2.1.39).

### What works through `.claude/` symlink

- `@.claude/AGENTS.md` import in CLAUDE.md — loaded at startup as a memory file (2.1k tokens)
- `.claude/skills/` auto-discovery — all 22 project skills loaded into context
- `.claude/settings.local.json` — permissions and hooks applied

### What was broken

`@/.claude/AGENTS.md` (leading `/`) resolved to absolute path `/.claude/AGENTS.md` at filesystem root — silently failed. Fixed to `@.claude/AGENTS.md` (relative path, resolves from CLAUDE.md location).

### SessionStart hook not needed

Considered a hook to inject `.claude/AGENTS.md` conditionally ("if not loaded yet"). Rejected because:

- No way for a hook to check what `@` imports already loaded
- Would duplicate content in context window
- The `@` import works reliably through the symlink — no fallback needed

### Codex compatibility

Codex does not support `@` imports. The `@.claude/AGENTS.md` line is plain text to Codex. The instructional text in AGENTS.md ("Use AGENTS.md") prompts the model to read the file via tool call during the session. This is by design — Codex loads instructions lazily.

## Steps

1. Decide on convention (A, B, or C)
2. Update the chosen script(s)
3. Update README.md in both `tools/wt/` and `tools/ensure-shared-config-links/`
4. Add a call to `ensure-shared-config-links.sh` at the end of `wt.sh` so worktrees get config links on creation
5. Test: create a fresh worktree with `wt.sh`, verify `ensure-shared-config-links.sh` runs and symlinks appear
