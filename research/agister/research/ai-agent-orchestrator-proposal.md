---
date: 2026-09-26
model: gpt-6
---

# AI Agent Orchestrator — Configuration Proposal

## Status

Draft proposal based on the current design direction.

## Goal

Define a small, declarative configuration model for an AI agent orchestrator without recreating a general-purpose automation platform.

The configuration describes three concerns:

- workflow topology,
- node behavior,
- reusable agent/runtime profiles.

The model is intentionally lightweight and can evolve as orchestration requirements become concrete.

---

## Core Model

The orchestrator is a directed execution graph.

Two primary node types:

- `flow` — controls execution topology.
- `task` — performs work on data.

Conceptually:

```text
Node
├── Flow
│   ├── route
│   ├── split
│   └── join
└── Task
```

Example:

```text
                   ┌─ adversarial review ─┐
                   ├─ lint review ────────┤
code diff ─ split ─┼─ test review ────────┼─ join ─ final synthesis
                   └─ architecture review ┘
```

---

## Configuration Layers

The configuration is split into three entities.

### 1. Workflow

**Format:** YAML

The workflow defines graph topology and references nodes.

```yaml
name: review-code
start: review_split

nodes:
  - review_split
  - adversarial
  - lint
  - tests
  - architecture
  - synthesis

edges:
  review_split:
    - adversarial
    - lint
    - tests
    - architecture

  adversarial:
    - synthesis

  lint:
    - synthesis

  tests:
    - synthesis

  architecture:
    - synthesis
```

Keeping edges in the workflow gives the workflow ownership of topology and allows nodes to be reused across workflows.

---

### 2. Node

**Format:** YAML

A node defines execution semantics.

#### Flow node

```yaml
type: flow
kind: split
```

Conditional routing:

```yaml
type: flow
kind: route

routes:
  - when: severity == "high"
    next: deep_review

  - default: true
    next: standard_review
```

Join:

```yaml
type: flow
kind: join
strategy: all
```

Initial flow kinds:

- `route` — choose an outgoing path.
- `split` — fan out into multiple branches.
- `join` — synchronize or combine branches.

Additional kinds such as retry, loop, gate, or timeout can be introduced later.

#### Task node

```yaml
type: task
agent: reviewer

prompt: |
  Review the diff adversarially.
  Look for hidden failure modes.
```

A task performs work using a referenced agent profile.

---

### 3. Agent

**Format:** TOML

Agent definitions contain reusable runtime and model settings.

```toml
runtime = "llm"
model = "gpt-5.6"
effort = "high"

[output]
format = "markdown"
```

Likely agent settings include:

- runtime,
- model,
- reasoning effort,
- tool permissions,
- output format,
- structured-output schema,
- limits and timeouts,
- provider-specific settings.

The task owns the work instruction. The agent owns reusable execution configuration.

---

## Format Choice

```text
workflow YAML  → topology
node YAML      → behavior
agent TOML     → runtime configuration
```

YAML fits workflows and nodes because they contain nested graph structures, lists, branches, references, and multiline prompts.

TOML fits agent profiles because they are primarily settings-oriented.

---

## Design Principles

### Separate topology from execution

The workflow describes how nodes connect.

Nodes describe what happens at a graph position.

Agents describe how a task is executed.

### Keep the DSL small

The system should model AI orchestration primitives rather than expand into a general automation DSL.

### Prefer references over duplication

Reusable agent profiles are referenced by tasks rather than repeated across node definitions.

### Evolve from concrete requirements

The initial schema can remain intentionally incomplete and add semantics only when real workflows require them.

---

## Example Project Layout

```text
orchestrator/
├── workflows/
│   └── review-code.yaml
│
├── nodes/
│   ├── review-split.yaml
│   ├── adversarial.yaml
│   ├── lint.yaml
│   ├── tests.yaml
│   ├── architecture.yaml
│   └── synthesis.yaml
│
└── agents/
    ├── reviewer.toml
    └── synthesizer.toml
```

---

## Open Design Questions

### Join semantics

Define behavior for:

- waiting for all branches,
- waiting for any branch,
- partial completion,
- branch failure,
- merge strategy.

### Data passing

The initial model assumes node output becomes downstream node input.

Later revisions may define:

- named inputs and outputs,
- selectors,
- transformations,
- shared context,
- branch-local state.

### Conditions

Conditional routing needs an expression model.

Possible directions:

- small built-in expression syntax,
- JSONPath/JMESPath-style selectors,
- host-language expressions.

This can remain unspecified until routing requirements are concrete.

---

## Proposed Initial Scope

```text
Node types:
  flow
  task

Flow kinds:
  route
  split
  join

Configuration:
  workflows/*.yaml
  nodes/*.yaml
  agents/*.toml
```

This is sufficient for sequential tasks, conditional routing, parallel fan-out, synchronization, and reusable agent configurations.
