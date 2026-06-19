---
date: 2026-06-19
model: claude-opus-4-8
description: "Session-digest backlog items"
---

# TODO

- [ ] **Repo-aware project identity for session grouping.** Don't key "project"
  on the raw directory path — multiple git worktrees of the same repo would then
  count as separate projects. Group by git remote / common repo root instead.
  (Surfaced as a Claudescope limitation; see `docs/research/claudescope.md`.)
