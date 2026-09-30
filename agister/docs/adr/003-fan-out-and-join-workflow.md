# ADR-003: A fan-out and join workflow

- **Status:** Accepted
- **Date:** 2026-09-30
- **Scope:** running several processes over the same inputs and one process
  over their results
- **Decision type:** Architecture
- **Amends:** [ADR-001](001-agister-cli-architecture.md) rules 1 and 12
- **Amended by:** [ADR-004](004-join-on-completed-nodes.md) (rules 3 and 4)

## Context

A review today is run by hand: several review processes over one
candidate, their outputs bundled by a script, then a judge process. Whoever
runs the steps can shape what the judge sees, and did (dogfooding,
2026-09-30: a scope string passed to the judge steered its rulings). No
record ties the judge's ruling to the reviews it ruled on.

ADR-001 defers task outcomes and routing to a future workflow layer, and
ADR-002 kept repair inside one node so that no workflow was needed. Review
is the first work that needs more than one node.

## Decision drivers

- What the joining process receives is fixed by settings and the children's
  records, never by whoever starts it.
- The core stays generic (ADR-001 rule 1): it knows no review, judge or
  verdict.
- One result shape for every node (ADR-001 rule 6), a workflow included.
- Every effect owned and bounded (ADR-001 rule 11), children included.
- The smallest shape the one use needs: no conditions, loops or graphs.

## Decision

A **workflow** is a settings definition with one fixed shape: a list of
**fan-out** nodes, each a process, run over the same resolved inputs, and
one **join** node, a process, run once after all of them complete, given
their results as one input.

```text
          workflow inputs, resolved once
         ┌──────────┼──────────┐
      node a     node b  …  node n      (concurrent, each a call)
         └──────────┼──────────┘
        barrier: every fan-out node completed?
          yes │                 no ──► no join; the workflow ends
              ▼
     join node (a fresh call), input: the collection
              │
     the join's result is the workflow's result
```

## Rules

### 1. A workflow is a settings definition

A workflow names its params, its fan-out nodes (each a unique node name and
a process) and its join node (a node name and a process). It is a settings
definition like a process (ADR-001 rule 2) and is run the same way,
`agister run <workflow>`, through the same client contract. `check` rejects
a workflow with no fan-out node, a missing or duplicate node name, a
reference to an unknown process, or a join process whose inputs cannot
receive the collection (rule 4).

### 2. Inputs are resolved once, before any node starts

The workflow's params are resolved once, as a call's are (ADR-001 rule 8),
and every fan-out node receives the same resolved values: a revision as its
commit identity, content as its digest. Each fan-out node is then an
ordinary call of its process with those values, its own limits, workspace
and evidence. The join never receives them (rule 4).

### 3. The barrier waits for every fan-out node

Fan-out nodes may run concurrently. The join starts only after every
fan-out node has ended and all of them completed. If any did not complete
(refused, failed, interrupted, lost), the join does not start, and the
workflow's result takes the status and failure class of the first such
node in declaration order. The workflow's record names every node's run and
outcome, and which one blocked the join.

### 4. The join receives the collection and nothing else

The join's collection input holds, for each fan-out node in declaration
order, the node name, its process, its run ID and its recorded output,
unchanged. Order never depends on completion order. The core transports
the outputs without reading them (ADR-001 rule 1). The join's other inputs
are only fixed values its own process declares in settings; nothing from
whoever started the workflow reaches it, workflow params included. `check`
rejects a join process whose inputs take a caller-supplied param. The join
is a fresh call, never a continuation of a fan-out node's session.

### 5. The workflow's result is the join's

A workflow ends in a node result (ADR-001 rule 6). When the join runs, the
workflow's status, class and output are the join's; usage and cost sum
every node's that reported them, and are unknown if any is. Timing covers
the whole workflow. No field, status or class exists only for workflows.

### 6. The workflow owns its nodes

The workflow run is a record of its own: the exact workflow definition and
input digests, each node's run ID, the barrier's state, timing and result.
Each node's run records the workflow run it belongs to. Cancellation is
terminal: once the workflow is cancelled, no node starts, the join
included, even when every fan-out node has already completed; cancellation
and starting a node are serialized, so one of them wins. Every active node
is cancelled, and the workflow ends interrupted, class cancelled. A node's
effects stay its own call's
(ADR-001 rule 11), and a reap after a killed CLI treats the workflow run
like any unfinished run.

## Amendments to ADR-001

- Rule 1 adds: the core also runs a workflow of this one shape; it still
  knows no meaning of any node's output.
- Rule 12 adds a second deliberate exception: a join receives the recorded
  outputs of its own workflow's fan-out nodes.

## Consequences

### Positive

- The judge's input is fixed by settings and records, and the ruling is
  tied to the reviews it ruled on.
- Review becomes one command, and the bundling script goes.
- Workflows keep routing on one result shape.

### Negative

- The core gains a second kind of run and a parent-child relation between
  runs.
- A join sees nothing when one fan-out node fails; there is no partial
  join.
- Concurrent fan-out multiplies load and cost by the number of nodes.

## Alternatives considered

- **Keep the bundling script:** rejected; the caller shapes the judge's
  input and nothing records the link.
- **A review command in code:** rejected by ADR-001 (kinds of work in code).
- **A general graph (conditions, loops, retries, nested workflows):**
  rejected; no use needs it now.
- **A partial join or quorum:** rejected; a ruling on part of the reviews is
  not the review.

## Explicit non-decisions

The exact settings syntax; how many fan-out nodes run at once; a
workflow-level timeout or cost limit beyond each node's own; acting on the
join's output; continuing a workflow.
