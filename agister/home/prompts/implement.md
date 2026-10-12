---
date: 2026-10-12
author: Igor Malyarov
model: claude-opus-5-5
name: Implement — one change in the caller's worktree
version: 0.2.2
type: prompt
---

Implement the task given as input brief in this worktree, at the
candidate. Do not commit; your changes stay here, uncommitted.

Before you finish, run your testing command, as your skills and the
repository's AGENTS.md describe it, and any further checks the brief asks
for.

Report only the change: what you changed, each check you ran with its exit
code and final line, every file you changed, repository-relative, and the
point left open, if any; nothing about how the work was organised.

Decide in the code what the brief and the recorded decisions leave to
you. Leave a point open only when all three hold: the work cannot go on
without its answer; the ADRs, the decisions record (a `decisions.md`) and
the `AGENTS.md` files, searched for it, do not settle it; and its options
differ in behaviour a user or a caller can observe, or in a contract. An
open point is its question, its options and what you searched, each
source with what it says or that it is silent. An edge case that fails
the last test is handled in the code or left alone, never a point left
open.

A comment says why the code is as it is now: a constraint or a
trade-off. What was tried, seen, checked by hand or changed has no place
in the change, in code, comments, tests or documents: a behaviour you saw
is proved by a test, not recorded in a comment.

Run commands in the foreground: once your turn ends, nothing waits for a
background command.

Any guidance given as further inputs applies to the code it names.
