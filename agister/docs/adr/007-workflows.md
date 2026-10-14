---
date: 2026-10-14
model: claude-opus-5-5
description: "ADR-007: workflows: one call, or a fan-out joined on its outcomes; the join is given the collection and nothing from the caller"
---

# ADR-007: Workflows

- **Status:** Proposed
- **Date:** 2026-10-14
- **Scope:** the two shapes of a workflow, how its nodes run, what the
  join is given, and the workflow's result and record
- **Decision type:** Architecture

## Context

Some work needs more than one call: several reviews of one candidate,
then a judge that rules on them. Run by hand, whoever bundles the
reviews shapes what the judge sees, and no record ties the ruling to the
reviews it ruled on. Most work needs one call.

## Decision

A workflow is a piece of work Agister can run: one `call`, or a
`fan_out` of calls over the same inputs followed by one `join`. Every
node binds a process to an agent and runs as a call. Settings hold how a
workflow is written (ADR-002); `core/workflow` runs it, resolved, through
the port it declares to run a call, and knows no meaning of any node's
output.

## Rules

### 1. What Agister runs is a workflow

Core runs a workflow; a node binds a process to the agent that runs it
(ADR-002, rule 5).

### 2. A `call` workflow is one call

A `call` workflow has one node. Its params are its process's, and its
run is that call's run: one record, naming the workflow, the process and
the agent. It can be continued (ADR-004, rule 5).

### 3. A fan-out runs every node over the same inputs

A `fan_out` workflow names its params, its fan-out nodes and its join
node. Its inputs are resolved once, and every fan-out node gets the same
values. Each fan-out node is a call of its own, with its own limits,
hold and record, and the nodes may run at the same time. A fan-out
workflow cannot be continued.

### 4. The join waits for every node and runs on what completed

The join starts once every fan-out node has ended, if at least one
completed. If none completed, no join runs, and the workflow ends with
the status and class of its first node.

### 5. The join is given the collection and nothing else

The collection holds, for each fan-out node in declaration order, its
status and class and, if it completed, its output as recorded. An entry
names no node, process or run: the join tells the entries apart by their
place. The join's other inputs are fixed values its own process
declares; nothing from the caller reaches it, the workflow's params
included. The join is a fresh call, never a continuation of a node's
session.

### 6. The workflow ends in a call's result shape

A workflow's status, class and output are its join's, or, with no join,
its first node's. Usage and cost sum every node's; they are unknown if
any node's is. Timing covers the whole workflow. Its warnings are every
node's. No status, class or field exists only for workflows (ADR-001,
invariant 3).

### 7. The workflow run records its nodes

A fan-out workflow's run is a record of its own: its definition, its
inputs, each node with its process and run in declaration order, the
collection as the join received it, and its result. Each node's run
names the workflow run it belongs to.

### 8. Cancelling a workflow is final

A cancelled workflow starts no node, its join included, and cancels
every node that is running; it ends interrupted, cancelled.

## Consequences

- What a join rules on is fixed by settings and its nodes' records,
  never by whoever starts it.
- One failed node does not waste the ones that completed.
- A process is reused across workflows and agents without being copied.
