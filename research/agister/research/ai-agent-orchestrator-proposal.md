---
date: 2026-09-26
model: gpt-6
---

# AI Agent Orchestrator — Configuration Proposal

## Status

Draft proposal based on the current design direction.

## Goal

Define a small, declarative configuration model for an AI agent orchestrator without recreating a general-purpose automation platform such as n8n.

The configuration should describe:

- workflow topology,
- node behavior,
- reusable agent/runtime profiles.

The model is intentionally lightweight rather than fully exhaustive or formally complete.

---

## Core Model

The orchestrator is represented as a directed execution graph.

Two primary node types are proposed:

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

A typical review workflow may look like:

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

Example:

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
```

An alternative representation is to keep edges explicitly in the workflow:

```yaml
name: review-code

start: review_split

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

This keeps graph topology separate from node implementation.

---

### 2. Node

**Format:** YAML

A node defines execution semantics.

#### Flow node

```yaml
type: flow
kind: split
```

A conditional routing node could be represented as:

```yaml
type: flow
kind: route

routes:
  - when: severity == "high"
    next: deep_review

  - default: true
    next: standard_review
```

A join node could be represented as:

```yaml
type: flow
kind: join

strategy: all
```

Possible flow kinds:

- `route` — choose an outgoing path.
- `split` — fan out into multiple branches.
- `join` — combine or synchronize branches.

Additional kinds can be introduced later if required, such as retry, loop, gate, or timeout.

#### Task node

```yaml
type: task
agent: reviewer

prompt: |
  Review the diff adversarially.
  Look for hidden failure modes.
```

A task represents actual work performed on the data passing through the graph.

Tasks can reuse the same agent profile while having different prompts and graph roles.

---

### 3. Agent

**Format:** TOML

Agent definitions primarily contain reusable runtime and model settings.

Example:

```toml
runtime = "llm"
model = "gpt-5.6"
effort = "high"

[output]
format = "markdown"
```

Likely agent configuration concerns include:

- runtime,
- model,
- reasoning effort,
- tool permissions,
- output format,
- structured-output schema,
- limits and timeouts,
- provider-specific settings.

The task owns the work instruction; the agent owns reusable execution configuration.

---

## Format Choice

### YAML

Use YAML for workflows and nodes.

It fits graph-oriented definitions because it handles:

- nested structures,
- lists,
- branching,
- references,
- multiline prompts.

Example:

```yaml
type: task
agent: reviewer

prompt: |
  Review the code diff.
  Focus on architectural regressions.
```

### TOML

Use TOML for reusable agent/runtime configuration.

It works well for settings-oriented data:

```toml
model = "gpt-5.6"
effort = "high"

[output]
format = "json"
```

Proposed separation:

```text
workflow YAML  → topology
node YAML      → behavior
agent TOML     → runtime configuration
```

---

## Terminology

### `Task`

Preferred replacement for `Content`.

`Task` describes an execution unit more accurately because content is the data passing through the node rather than the node itself.

Other terms considered:

- Step
- Operation
- Processor
- Work

### `Flow`

Preferred as the broad node type for execution-control nodes.

Example:

```yaml
type: flow
kind: route
```

rather than:

```yaml
type: route
```

This preserves a stable high-level node taxonomy while allowing new flow operations to be added through `kind`.

---

## Design Principles

### Keep topology separate from execution

The workflow describes how nodes connect.

Nodes describe what happens at a graph position.

Agents describe how a task is executed.

### Keep the DSL small

The system should model the execution graph required for AI orchestration rather than becoming a general visual automation engine.

### Prefer references over duplication

Reusable agent profiles should be referenced by tasks rather than repeated across node definitions.

### Allow incomplete declarative definitions

The initial DSL can remain intentionally small and evolve as concrete orchestration requirements appear.

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

Example task:

```yaml
# nodes/adversarial.yaml

type: task
agent: reviewer

prompt: |
  Review the diff adversarially.
  Look for hidden failure modes.
```

Example shared agent:

```toml
# agents/reviewer.toml

runtime = "llm"
model = "gpt-5.6"
effort = "high"

[output]
format = "markdown"
```

---

## Open Design Questions

### Edge ownership

Two viable models remain:

**Workflow-owned edges**

```yaml
edges:
  review_split:
    - adversarial
    - lint
```

This gives the workflow complete ownership of topology.

**Node-owned edges**

```yaml
type: flow
kind: split

next:
  - adversarial
  - lint
```

This is more compact but couples node behavior to one graph.

Workflow-owned edges are likely preferable if node reuse across workflows is important.

### Join semantics

The DSL still needs a precise model for:

- waiting for all branches,
- waiting for any branch,
- partial completion,
- branch failure,
- merge strategy.

### Data passing

The initial model assumes node output becomes downstream node input.

A later revision should define:

- named inputs and outputs,
- selectors,
- transformations,
- shared context,
- branch-local state.

### Conditions

Conditional routing will need an expression model.

Options include:

- a small built-in expression syntax,
- JSONPath/JMESPath-style selectors,
- embedded expressions from the host language.

This can remain unspecified until routing requirements are concrete.

---

## Proposed Initial Scope

A minimal first version can support:

```text
Node types:
  flow
  task

Flow kinds:
  route
  split
  join

Configuration:
  workflow.yaml
  nodes/*.yaml
  agents/*.toml
```

That is enough to express sequential tasks, conditional routing, parallel fan-out, synchronization, and reusable agent configurations without introducing a broad automation DSL.
