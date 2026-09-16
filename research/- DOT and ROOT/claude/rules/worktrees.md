---
date: 2026-06-24
model: claude-opus-4-8
description: "Worktrees — create with gitwt; sync config via the bundled sync script, never by hand. Canonical flow is the worktree dev-skill"
---

# Worktrees / Git

The canonical flow (create → sync config → clear build artifacts) lives in the
`worktree` dev-skill, which bundles the worktree creator and the config-sync
script. Use it for worktree work.

Create worktrees with the global `gitwt` helper (`~/bin/gitwt`, a symlink into the
skill's `git-worktree-create`): it creates a **new** branch in its own worktree at
`<parent>/<repo>.worktrees/<safe-branch>` (create-only, never checks out an
existing branch, local refs only, base defaults to HEAD).

When syncing worktree config, always use the sync script — never replicate config
by hand or hand-author symlinks. It owns the linking and is idempotent.

`gitwt`'s `.worktrees` / `.config` sibling scheme is exactly what the sync script
expects. A typed-prefix helper like `wt` (`<repo>-worktrees/wt-<prefix>-<name>`)
uses a different layout, does not match that convention, and is deprecated.
