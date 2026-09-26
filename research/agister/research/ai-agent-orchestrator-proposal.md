---
date: 2026-09-26
model: gpt-6
---

# AI Agent Orchestrator — Configuration Proposal

## Status

Draft proposal based on the current design direction.

## Goal

Define a declarative configuration model for complex AI-agent orchestration.

The configuration separates three concerns:

- workflow topology and control flow,
- executable processes,
- reusable agent/runtime profiles.

The proposal is intentionally provisional. Syntax and boundaries should evolve from concrete orchestration requirements.

## Core Model

The orchestrator is a directed execution graph.

> **Control flow is graph structure unless it actually performs computation.**

Sequencing, conditional paths, fan-out, and fan-in are expressed by the workflow graph. Executable work is represented by `process` nodes.

```text
Workflow
├── topology
│   ├── sequencing
│   ├── conditional routing
│   ├── fan-out
│   └── fan-in
└── processes
    ├── agent invocation
    ├── tool invocation
    ├── code execution
    ├── deterministic transform
    ├── external process / API
    └── other executable work
```

```text
                   ┌─ adversarial review ─┐
                   ├─ lint review ────────┤
code diff ─────────┼─ test review ────────┼─ final synthesis
                   └─ architecture review ┘
```

Fan-out exists because the graph has multiple outgoing paths. It does not require a `split` node.

## Task and Process Model

A **task** is the overall objective the workflow is executing, such as implementing a feature or resolving an issue.

A **workflow** defines how that task is carried out through processes and orchestration between them.

A **process** is an executing participant or unit of work within the workflow, such as an implementer, test runner, reviewer, tool invocation, or code execution. Processes may be stateful and long-lived.

```text
Task
└── Workflow
    ├── Process
    ├── Process
    └── orchestration between processes
```

## Configuration Layers

### 1. Workflow

**Format:** YAML

The workflow owns graph topology and references processes.

```yaml
name: review-code
start: prepare_diff

processes:
  - prepare_diff
  - adversarial
  - lint
  - tests
  - architecture
  - synthesis

edges:
  prepare_diff:
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

Multiple outgoing edges represent fan-out. Multiple incoming edges represent fan-in.

Conditional routing is also workflow topology. Exact syntax remains open; conceptually:

```yaml
edges:
  classify:
    - when: severity == "high"
      to: deep_review
    - default: true
      to: standard_review
```

The workflow remains the single owner of topology.

Routing to a process may either continue an existing process or start a new one.
This distinction is significant for stateful processes: returning a test report
to the same implementer is different from starting a fresh implementer with that
report.

The exact syntax remains open.

### 2. Process

**Format:** YAML

A process is an executable unit of work within the workflow. A process may be stateful and may receive work multiple times during execution.

```yaml
type: process
uses: agent:reviewer

input:
  instruction: |
    Review the diff adversarially.
    Look for hidden failure modes.
```

Processes can represent other executable mechanisms:

```yaml
type: process
uses: tool:lint
```

```yaml
type: process
uses: code:run-tests
```

```yaml
type: process
uses: transform:normalize-results
```

The exact `uses` syntax is illustrative. A process performs work; the workflow determines how execution moves between processes.

### 3. Agent

**Format:** TOML

Agent definitions contain reusable execution configuration.

```toml
runtime = "llm"
model = "gpt-5.6"
effort = "high"

[output]
format = "markdown"
```

Likely settings include runtime, model, reasoning effort, tool configuration and permissions, output configuration, limits and timeouts, and provider-specific settings.

The current boundary treats characteristics such as model and reasoning effort as properties of the agent definition.

## Process Re-entry and Cycles

Workflow edges may form cycles. When control returns to a process, the workflow must distinguish between continuing the **same process** and starting a **new process**.

For example, an implementer can write code, a test runner can produce a test report, and failed tests can return that report to the same implementer process. Because the implementer process retains its state, only the new test report may need to be passed back.

```text
                         failing
                    ┌───────────────┐
                    ▼               │
implementer ───▶ test runner ───────┤
                    │               │
                    └── passing ───▶ review
```

Conceptually:

```yaml
edges:
  implementer:
    - to: test_runner

  test_runner:
    - when: output.failed > 0
      to: implementer
      process: same

    - when: output.failed == 0
      to: review
```

`process: same` / `process: new` is illustrative syntax. Process identity is part of workflow semantics; the exact representation remains open.

## Dataflow

Control-flow dependencies and data dependencies are related but distinct.

A process may consume output from any relevant upstream node rather than only its nearest predecessor.

```yaml
type: process
uses: agent:synthesizer

inputs:
  adversarial: adversarial.output
  lint: lint.output
  tests: tests.output
  architecture: architecture.output
```

This syntax is illustrative. A later revision should define the data-reference model from concrete requirements, including named inputs and outputs, field selection, transformations, shared context, branch-local state, and multiple producers.

Data dependencies are not limited to process return values. Processes may
produce artifacts or effects that later execution depends on, such as files,
commits, records, or changes to external state.

The configuration model will need to represent such dependencies where they are
relevant to orchestration. Exact semantics remain open.

## Discussion: Task Refinement

Execution may discover additional work required to complete a task. For example,
a review may produce findings that become new work to be performed.

This refines the task being carried out rather than changing the workflow
definition. The model for representing such refinement remains open.

## Fan-In / Join Semantics

Fan-in occurs when multiple graph paths converge on a downstream process.

> A downstream process with multiple required incoming paths waits for all of them.

This keeps synchronization primarily a property of graph execution rather than requiring a dedicated `join` node. More advanced synchronization semantics can be introduced when concrete workflows require them.

## Failure Semantics

Any executable process may fail. Failure behavior therefore belongs to the general execution model.

The model will need semantics for process failure state, retries, propagation, recovery paths, routing based on failure, and downstream behavior when an upstream dependency fails.

An open architectural question is whether failure is represented as graph-visible state/output, execution policy, or a combination.

## Discussion: Graph-Native Control Flow

Graph-native control flow is the default model. Conditions, fan-out, fan-in, and sequencing are properties of workflow topology.

Advantages:

- topology has one owner,
- graph visualization maps directly to execution structure,
- validation can reason over the workflow as a whole,
- fan-out requires no artificial `split` entity,
- processes remain reusable independently of a particular workflow.

The workflow DSL consequently carries the control-flow semantics required for complex orchestration.

## Discussion: Executable Control Escape Hatch

Some control operations may need to perform actual computation rather than merely describe topology. In that case, an executable control construct may be appropriate.

```text
structural control → workflow graph
computed control   → executable construct
```

The test remains:

> **Control flow is graph structure unless it actually performs computation.**

This allows sophisticated orchestration without turning every structural graph operation into an executable node. Its exact representation should be introduced when a concrete use case requires it.

## Format Choice

```text
workflow YAML  → topology and control flow
process YAML   → executable work
agent TOML     → reusable runtime configuration
```

YAML fits workflows and processes because they can contain nested structures, lists, branches, references, and multiline content. TOML fits agent profiles because they are predominantly settings-oriented.

This format split is provisional. If agent definitions become structurally complex enough that YAML provides a better representation, the format can change without altering the conceptual separation.

## References and Identity

Processes and other reusable entities require stable references.

Questions such as local versus global identifiers, filename-derived identity, logical names, and path references should remain visible as the design develops. Concrete reuse and composition requirements can determine the useful semantics.

## Example Project Layout

```text
orchestrator/
├── workflows/
│   └── review-code.yaml
├── processes/
│   ├── prepare-diff.yaml
│   ├── adversarial.yaml
│   ├── lint.yaml
│   ├── tests.yaml
│   ├── architecture.yaml
│   └── synthesis.yaml
└── agents/
    ├── reviewer.toml
    └── synthesizer.toml
```

The layout illustrates separation of topology, executable work, and reusable agent configuration. Composition and reuse mechanics remain open.

## Design Principles

### Control flow belongs to the graph

Sequencing, conditions, fan-out, and fan-in are topology unless the control operation itself performs computation.

### Processes perform work

A process represents executable behavior and may be backed by an agent, tool, code, transform, external process, or another execution mechanism.

### Control flow and dataflow are distinct

Graph edges determine execution dependencies. Processes may reference data produced by multiple relevant nodes.

### Failure is a general execution concern

Every process can fail, so failure semantics apply across the orchestration model.

### Separate reusable execution configuration

Agent profiles capture reusable runtime characteristics independently of process instructions and workflow topology.

### Evolve from complex use cases

The schema should gain semantics when real orchestration requirements justify them rather than attempting to enumerate the final DSL in advance.
