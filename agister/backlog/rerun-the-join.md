---
date: 2026-10-14
model: claude-opus-5-5
description: "Backlog: run only a workflow's join on its nodes' recorded outputs, from LAB-252"
---

# Run only a workflow's join

From LAB-252. When a join fails, or never starts, after its fan-out
nodes completed, the only way to its result is to run the whole workflow
again, every node included, and the nodes' outputs are thrown away. A
review whose judge hit a usage limit repeated all its reviewers.

## Wanted

- A workflow run whose join failed or did not start can be completed by
  running only the join, on the outputs its nodes recorded.
- The join's run records which run's node outputs it took, so the record
  says what was ruled on.
- It is refused when the outputs are not all recorded, or when the
  workflow's settings changed in a way that changes the join's input.

## Where it lands

ADR-007: the collection is recorded as the join received it (rule 7),
and the join is a fresh call (rule 5), so a join can be run again on a
recorded collection without a new kind of run.
