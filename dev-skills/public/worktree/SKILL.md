---
name: worktree
author: Igor Malyarov
version: "0.2.0"
description: >
  Create a new git worktree, sync shared config into it via the bundled sync
  script (never replicate config by hand or hand-author symlinks), and clear
  leftover build artifacts. Triggers on "create a worktree", "new worktree",
  "set up a worktree". Self-contained — the worktree creator and config-sync
  script ship with this skill under scripts/.
---

# Worktree

Create a feature worktree, sync its shared config from the bundled sync script,
and deal with leftover build artifacts. The scripts this skill needs are bundled
under its own `scripts/` directory, so it works without any pre-installed tooling.

Below, `<skill-dir>` is this skill's base directory — the absolute path announced
when the skill loads. Run the commands from **inside the target git repository**
(the creator resolves the repo from the current directory).

## Steps

### 1. Create the worktree

Always call the bundled creator by its path — it works regardless of `PATH` and
needs nothing installed. It creates a **new** branch in its own worktree at
`<parent>/<repo>.worktrees/<safe-branch>` — create-only (never checks out an
existing branch), local refs only, base defaults to `HEAD`.

```bash
"<skill-dir>/scripts/git-worktree-create" <branch> [<base-branch>]
# e.g. "<skill-dir>/scripts/git-worktree-create" feature/new-api origin/trunk
```

Do **not** branch on whether `gitwt` is installed: the `gitwt` global is only on
`PATH` in interactive shells, so that check is unreliable from an agent or a
non-interactive shell. `gitwt` is a human convenience for typing in a terminal
(see the install section); the bundled path is the canonical invocation here.

It prints the target directory and a `cd` line. Capture the target dir for step 2.

### 2. Sync shared config — never by hand

Run the bundled sync script against the new worktree path (this one works from any
directory). **Do not replicate config by hand or hand-author symlinks** — the
script owns that and is idempotent.

```bash
"<skill-dir>/scripts/ensure-shared-config-links.sh" "<worktree-path>"
```

It links every direct child of the sibling `<repo>.config` directory into the
worktree root (skipping git metadata, `README.md`, and junk). Safe to re-run. See
`references/shared-config-links.md` for the convention and failure modes.

### 3. Handle leftover build artifacts

A fresh worktree shares no build output with the main checkout, but a reused
target dir or synced config can leave stale artifacts (`.build/`, `node_modules/`,
`DerivedData/`). Remove or regenerate them before building so the worktree builds
clean.

## Global `gitwt` install (optional, one-time per machine)

To run the creator as a global `gitwt` command, symlink it to the **stable
marketplace checkout** of this skill (auto-updates when the skill republishes):

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
