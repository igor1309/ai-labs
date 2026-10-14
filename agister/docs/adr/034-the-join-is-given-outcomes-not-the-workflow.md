# ADR-034: The join is given outcomes, not the workflow

- **Status:** Accepted
- **Date:** 2026-10-12
- **Scope:** what each entry of the collection a join receives holds
- **Decision type:** Architecture
- **Amends:** [ADR-003](003-fan-out-and-join-workflow.md) rule 4 and
  [ADR-004](004-join-on-completed-nodes.md) rule 2 (each entry names its
  node, process and run ID)
- **Source:** LAB-200; the owner's decision, 2026-10-12

## Context

A join's agent rules on what the fan-out nodes produced. Each entry of
its collection also names the node, the process and the run that
produced it: in `code_review`, the judge reads that review 1 is
`architecture`, run by `architecture_review`, with its run ID. None of
it is evidence the judge may weigh: it rules on each finding's evidence
and numbers the reviews by their place in the collection. What it does show is the workflow around the
judge: which reviewers there are and what each covers. An agent that
knows the process it is part of starts to reason about it ("another
review covers this"), which is the boundary the prompts keep (LAB-200).

The workflow's record already names every node, its process and its run
(ADR-003 rule 6), so the collection need not carry them for anyone else.

## Decision

### 1. An entry is an outcome

The collection holds, for each fan-out node in declaration order, its
status and class and, only if it completed, its recorded output,
unchanged. An entry names no node, process or run. A join tells the
entries apart by their place in the collection, from 1.

### 2. The record keeps the names

The workflow's record names each node, its process and its run, in the
same declaration order, so an entry's place leads to its node. The
collection is stored with the workflow run as the join received it
(ADR-003 rule 6, unchanged).

## Consequences

- A join process's prompt and instruction speak of entries by place, not
  by node: the review judge's already do.
- Reading which node produced an entry takes the workflow's record beside
  the collection.
- A collection recorded before this decision keeps its names; it is
  never given to a join again (a workflow is not continued).

## Alternatives considered

- **Keep the names and tell the judge to ignore them:** rejected; an
  instruction to ignore what is given still tells the agent the process.
- **Give the names to the record of the join only, not its prompt:**
  rejected; the join's prompt is built from its recorded inputs, so
  what its record holds and what its agent receives stay one.
