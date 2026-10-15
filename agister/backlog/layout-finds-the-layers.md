---
date: 2026-10-15
model: claude-opus-5-5
description: "Backlog: settings/layout finds the layers, as ADR-001 says; the code on trunk leaves it to the composition"
---

# Layout finds the layers

ADR-001 gives `settings/layout` the selection of the layers: home, the
repository's `.agister` and the nearest project's, through its
filesystem and worktree-root ports. The code on trunk takes the three
folders as parameters and leaves the search to the composition
(`layout.go`: "the composition finds the folders").

The owner (2026-10-15): layout it is. The rules of where settings live
stay in settings, and the composition stays wiring (ADR-001, rule 3).
`docs/settings-implementation.md` says so.

## To do

- Layout takes home's folder and the launch directory, and declares the
  worktree-root port: the root of the git worktree holding a directory,
  or none.
- It finds the repository layer at the root, and the project layer as
  the nearest `.agister` below it, from the launch directory upward;
  outside a worktree, home alone.
- Its feature files specify the search; the reading is unchanged.
