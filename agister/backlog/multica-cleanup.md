---
date: 2026-10-16
model: claude-opus-5-5
description: "Backlog: a selective cleanup of the open Multica issues, each judged against the new Agister, never closed in bulk; the owner's decision"
---

# Cleaning up the Multica issues

The owner, 2026-10-16: a selective cleanup, not a blind one. On that
day the `ai-labs` workspace held 105 open `LAB-*` issues (55 backlog,
41 todo, 8 in review, 1 in progress), 92 of them Agister's. Most were
written against the archived implementation, before ADR-001 to
ADR-013.

## How

- Each open issue is read whole, with its comments, and judged on its
  own against the ADRs and the code as they stand. Nothing is closed
  by a filter on title, label, age or status.
- An issue the new Agister already settles is closed, its comment
  naming what settles it: an ADR and its rule, a backlog file, or a
  merged PR.
- An issue that still holds is kept, its text brought up to date, or
  carried into a backlog file that names it; then it is closed,
  pointing to that file.
- An issue tied to the archive alone is closed as such, saying so.
- An issue the owner must decide is listed for the owner, not closed.
- Issues outside Agister are left to their projects.

## Done when

Every open Agister issue is closed with its reason, or kept with a
current text; and the owner has the list of those left for a decision.
