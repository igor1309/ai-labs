---
name: worktree
author: Igor Malyarov
version: "0.3.0"
description: >
  Create or remove a linked Git worktree through public lifecycle commands that
  synchronize shared config and invoke optional project runtime hooks. Triggers
  on "create a worktree", "new worktree", "set up a worktree", "remove a
  worktree". Self-contained — the orchestration, creator, and config-sync scripts
  ship with this skill under scripts/.
---

# Worktree

Create or remove a feature worktree through the bundled public orchestration
commands. They keep shared configuration and optional project-owned runtime
resources in the worktree lifecycle. The scripts this skill needs are bundled
under its own `scripts/` directory, so it works without pre-installed tooling.

Below, `<skill-dir>` is this skill's base directory — the absolute path announced
when the skill loads. Run the create command from **inside the target Git
repository**; the remove command receives its target as an explicit path.

## Steps

### 1. Create and provision the worktree

Always call the bundled public command by its path — it works regardless of
`PATH` and needs nothing installed. It creates a **new** branch in its own
worktree at `<parent>/<repo>.worktrees/<safe-branch>`, synchronizes shared config,
then invokes the project's executable `.worktree-hooks/runtime` hook when one is
present. The hook receives the canonical absolute worktree path, and its stdout
is forwarded unchanged.

```bash
"<skill-dir>/scripts/worktree-create" <branch> [<base-branch>] [-C|--dir <target-root>]
# e.g. "<skill-dir>/scripts/worktree-create" feature/new-api origin/trunk
```

The command preserves this order:

1. `git-worktree-create` creates the new branch and linked worktree.
2. `ensure-shared-config-links.sh` synchronizes shared configuration.
3. `<absolute-worktree>/.worktree-hooks/runtime provision --worktree <absolute-worktree>`
   runs when the hook is executable.

A provisioning failure returns nonzero and leaves the created worktree available
for retry. The command does not roll it back.

Do **not** branch on whether `gitwt` is installed: `gitwt` is the low-level
create-only command and lives on `PATH` only in interactive shells. It does not
synchronize config or invoke project runtime provisioning.

### 2. Handle leftover build artifacts

A fresh worktree shares no build output with the main checkout, but a reused
target directory or synchronized config can leave stale artifacts (`.build/`,
`node_modules/`, `DerivedData/`). Remove or regenerate them before building so
the worktree builds cleanly.

### 3. Dispose and remove the worktree

Call the bundled public removal command with an explicit worktree path:

```bash
"<skill-dir>/scripts/worktree-remove" "<absolute-worktree-path>"
```

Before resolving a project hook, the command canonicalizes the target and proves
it is an exact registered linked worktree in its own repository. It refuses the
primary checkout, unrelated directories, and paths inside a worktree.

When an executable project hook exists, the command runs:

```bash
<absolute-worktree>/.worktree-hooks/runtime dispose --worktree <absolute-worktree>
```

Only successful disposal proceeds to `git worktree remove`. Failed or ambiguous
disposal returns nonzero and preserves both worktree and runtime state for retry.
An absent hook is a no-op only when `.worktree-runtime` enrollment state is also
absent. A missing, broken, or non-executable hook refuses removal when that state
exists.

### 4. Keep the narrow scripts narrow

`git-worktree-create` remains create-only, and
`ensure-shared-config-links.sh` remains link-only. Do not invoke either as a
substitute for the public lifecycle commands, and never replicate config or
hand-author shared-config symlinks. See `references/shared-config-links.md` for
the linking convention and failure modes.

## Low-level `gitwt` install (optional, one-time per machine)

To run the create-only helper as a global `gitwt` command, symlink it to the
**stable marketplace checkout** of this skill (auto-updates when the skill
republishes):

```bash
TARGET=~/.claude/plugins/marketplaces/dev-skills/worktree/scripts/git-worktree-create
test -x "$TARGET" || { echo "dev-skills not synced yet — run: git -C ~/.claude/plugins/marketplaces/dev-skills pull"; }
mkdir -p ~/bin
ln -sf "$TARGET" ~/bin/gitwt   # ensure ~/bin is on PATH
```

`gitwt` is an external shell command, so it only needs a stable on-disk path —
the marketplace **checkout** (fixed path, auto-updating), not the SHA-versioned
plugin cache (`…/cache/dev-skills/dev-skills/<sha>/`, which rotates per publish
and must never be a symlink target).
