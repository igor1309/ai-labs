---
date: 2026-09-28
model: claude-opus-5-5
description: "Fixes to the git input sources of the Agister CLI."
version: 0.1.0
---

# Backlog — git input fixes

Forward tasks only. Each lands as its own commit with a regression test;
a fixed item is removed from this list.

## 1. Changed file names are split and quoted

`git.changed_files` splits `git diff --name-only` output with
`strings.Fields`, so `docs/my notes.md` becomes two files, `docs/my` and
`notes.md`. Git also quotes names with unusual characters (`core.quotePath`),
so `"caf\303\251.md"` reaches the agent in place of `café.md`.

- Read `git diff --name-only -z` and split on NUL.
- Test in a temp repository with a file whose name has a space and one with a
  non-ASCII name.
