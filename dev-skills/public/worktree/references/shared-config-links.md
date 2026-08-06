---
date: 2026-01-14
model: gpt-5.2
description: "Ensure each worktree links to a shared config directory."
reviewer: claude-opus-4.5
---

# Shared worktree config symlinks

This tool ensures every git worktree receives the same ignored/local configuration by creating symlinks from the worktree root to a shared sibling directory.

## Convention (hard requirement)

Worktrees must live under:

- `/X/<repo>.worktrees/<worktree-name>`

Shared config must live alongside:

- `/X/<repo>.config`

Given a worktree root `/X/<repo>.worktrees/foo`, the script derives the shared config directory as `/X/<repo>.config`.

## Behavior

For every *direct child* entry inside `/X/<repo>.config` (files and directories), the script ensures a symlink exists in the worktree root with the same name:

- `<worktree>/<name>` -> `<shared>/<name>`

The shared directory is created if missing.

## Safety / failure modes

The script aborts early for layout errors and warns (but continues) on conflicts:

- Refuses to run if the provided path looks like the worktrees container (`*.worktrees`).
- Refuses to run if the path is not a git working tree.
- Refuses if the derived shared config path resolves inside the worktree (self-referential layout).
- Warns and skips any existing **non-symlink** in the worktree root (prevents clobbering tracked files or local data). Remaining entries are still processed.

If a name collision happens (e.g. repo tracks `agent/` but shared config also has `agent/`), resolve the conflict by renaming one side.

## Un-ignored links

The symlinks are shared config, never repository content, so each name needs a matching pattern in the consuming repo's `.git/info/exclude` (or its `.gitignore`). Nothing creates those patterns automatically, and a missing one is silent — the link simply shows up as untracked in every `git status` from then on.

After linking, the script reports every link it manages that git does not ignore, listing the names and the exclude file to append them to. It checks **all** managed links, not only ones created on this run, so an entry that was linked long ago and never excluded still surfaces. Links that are legitimately tracked in the repository are not reported.

This is advisory: the script never edits git state, and the warning does not change the exit code.

## Usage

Typical integration (after creating a worktree):

```bash
git worktree add "/X/<repo>.worktrees/$name" "$branch_or_commit"
./ensure-shared-config-links.sh "/X/<repo>.worktrees/$name"
```

## Notes

- The tool does not copy files. It creates symlinks so all worktrees share identical config contents.
- The script skips obvious junk entries (`.DS_Store`, `Thumbs.db`), git metadata (`.git`, `.github`, `.gitignore`, `.gitattributes`, `.gitmodules`), and config docs like `README.md` at the shared-config root.
- Safe to run multiple times; already-correct symlinks are silently skipped.

## FAQ

**Do I need to `cd` into the worktree first?**
No. Run the script from anywhere and pass the worktree path as an argument.

**What gets symlinked?**
Every direct child of the shared config directory, except junk (`.DS_Store`, `Thumbs.db`), git metadata (`.git`, `.github`, `.gitignore`, `.gitattributes`, `.gitmodules`), and `README.md`.

**What if a tracked file conflicts with a shared config entry?**
The script warns and skips non-symlinks but continues processing the rest. Rename one side to resolve.

**Can I run it again after adding new shared config entries?**
Yes. It is idempotent — new symlinks are created, existing ones are left alone.

**I added a shared config entry and it shows as untracked. Why?**
Linking is only half the job; the name also needs a pattern in the consuming repo's `.git/info/exclude`. The script's un-ignored-links warning names the entry and the file to add it to.
