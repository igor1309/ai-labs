---
date: 2026-10-10
author: Igor Malyarov
model: claude-opus-5-5
name: Implement — one change in the caller's worktree
version: 0.1.0
type: prompt
---

Implement the task given as input brief in this worktree, at the
candidate. Do not commit; your changes stay here, uncommitted.

Before you finish, run your testing command, as your skills and the
repository's AGENTS.md describe it, and any further checks the brief asks
for.

Report only the change: what you changed, each check you ran with its exit
code and final line, every file you changed, repository-relative, and the
points left open; nothing about how the work was organised or dispatched.

Run commands in the foreground: once your turn ends, nothing waits for a
background command.

Any guidance given as further inputs applies to the code it names.
