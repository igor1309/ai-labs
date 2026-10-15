---
date: 2026-10-15
model: claude-opus-5-5
description: "ADR-013: a request names a workflow or a step; a step requested alone runs as a workflow of that one step"
---

# ADR-013: A request names a step

- **Status:** Accepted
- **Topic:** Running work
- **Date:** 2026-10-15
- **Scope:** what a request to run names, and what resolve, core and the
  record make of a step requested alone
- **Decision type:** Architecture
- **Amends:** ADR-001 and ADR-002

## Context

A request names a document by kind and name, and a run executes a
workflow (ADR-002, rule 6; ADR-012, terms). A workflow of one step
executes as a run with one call (ADR-012, rule 1).

Most workflows are one step, there only to bind a process to an agent.
Each pairing of a process and an agent needs a workflow of its own, so
the files grow with every process and every agent, and each says nothing
its step does not.

## Decision

A request names a workflow, or a step: a process and an agent. Resolve
makes a step requested alone into a workflow of that one step, and the
run executes it as any workflow.

## Rules / Invariants

### 1. A requested step is a workflow of one step

The workflow resolve makes has the process's inputs as its inputs and
the step's output as its output. It is no document: it has no file, no
layer and no name, and nothing extends or blocks it.

### 2. It resolves as its parts

Resolve composes the process and the agent and all they reference, and
plans the step, as for a step in a workflow (ADR-002, rules 5 and 6). A
block on the process or the agent refuses the request.

### 3. Core and the record are unchanged

Core takes the workflow and the request as for any run. The record names
the step's process and agent where it would name a workflow.

## Consequences

- A process runs with an agent without a workflow file; a workflow is
  written when it composes more than one step.
- A repository blocks a process or an agent, not a pairing of them.
- The command-line syntax for naming a step is the CLI's.
- Adoption amends the request and resolve (ADR-001, ADR-002).

## Non-Goals

- An agent chosen by a workflow's parameter.
