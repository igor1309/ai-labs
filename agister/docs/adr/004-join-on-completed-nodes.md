# ADR-004: The join runs on the nodes that completed

- **Status:** Accepted
- **Date:** 2026-09-30
- **Scope:** a workflow whose fan-out nodes do not all complete
- **Decision type:** Architecture
- **Amends:** [ADR-003](003-fan-out-and-join-workflow.md) rules 3 and 4
- **Amended by:** [ADR-034](034-the-join-is-given-outcomes-not-the-workflow.md)
  (rule 2's entry names no node, process or run)

## Context

ADR-003 rule 3 starts no join if any fan-out node does not complete. On
2026-09-30 a code review spent $2.60 and 20 minutes: three reviewers
completed, one timed out, and the judge never ran, so the three completed
reviews were never ruled on (LAB-11).

## Decision

### 1. The barrier waits for every node, then joins on those that completed

The join starts once every fan-out node has ended, if at least one
completed. If none completed, no join starts, and the workflow's result
takes the status and class of the first node in declaration order, as
before. Cancellation stays terminal (ADR-003 rule 6): a cancelled
workflow starts no join.

### 2. The collection names every node

The collection holds every fan-out node in declaration order: node name,
process, run ID, status and class. Only a completed node carries its
recorded output. The core still transports without reading (ADR-001
rule 1).

### 3. The result stays the join's

The workflow's status, class and output are the join's (ADR-003 rule 5).
Its record names each node that did not complete.

## Consequences

- Completed work is always ruled on; one failed node costs only itself.
- A join process must tell a missing output from an empty one; the review
  judge's prompt says a missing review is not an approval.
- A workflow can end completed while a node failed; the record, not the
  status, says so.

## Alternatives considered

- **No partial join (ADR-003):** rejected; it discards completed work.
- **A quorum:** rejected; no use needs a threshold beyond one.
- **Rerunning failed nodes:** not decided here.
