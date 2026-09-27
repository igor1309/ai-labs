---
date: 2026-09-27
model: gpt-6-sol
---

# QUESTIONS

## Orchestration Model Investigation Form

### 1. Control-flow boundary

**When does control flow belong in graph topology versus executable work?**

Useful probes:
- Can routing conditions inspect values produced by prior work?
- If a value must be computed to make a routing decision, is that computation represented as a process?
- Where is the boundary between “evaluate a condition” and “perform computation”?

This tests the document's central invariant: control flow is structural unless it performs computation. ai\-agent\-orchestrator\-proposal.md

### 2. Process abstraction

**What counts as a process?**

Probe whether the model treats these uniformly or introduces distinct orchestration concepts:
- agent execution
- tool invocation
- code/function execution
- shell command
- deterministic transform
- external API/process
- human interaction
- nested/subworkflow execution

The important investigation is the abstraction boundary, not the eventual `uses:` syntax. ai\-agent\-orchestrator\-proposal.md

### 3. Uniform vs typed processes

**Is process one uniform orchestration abstraction with extensible implementations, or does the orchestration model define different process kinds with different semantics?**

This remains worth asking in a fresh investigation even though we established the invariant here.

### 4. Subworkflows

**If a workflow invokes another workflow, what is that invocation from the parent workflow's perspective?**

Possible models:
- transparent graph composition
- opaque process invocation
- process boundary with tooling capable of navigating into the nested workflow
- deliberately unsupported/deferred

### 5. Process re-entry

**When control returns to a process already used earlier in the run, can the workflow distinguish between continuing that process and starting a new one?**

This is especially important for stateful processes and is already identified by the document. ai\-agent\-orchestrator\-proposal.md

### 6. Process state ownership

**Who owns the internal state of a stateful process?**

Distinguish:
- runtime/provider-native state
- orchestrator-managed state
- explicit hybrid

This prevents “stateful process” from quietly turning into an orchestrator persistence specification.

### 7. Process completion

**What common fact does the orchestrator require from a process implementation to know that execution has completed?**

Possible boundary:
- common orchestration outcome such as completed/failed
- provider-specific completion understood by the engine
- no common contract yet

This is distinct from standardizing process output.

### 8. Process output contract

**Does orchestration require a common output representation across process implementations, or only a common execution outcome?**

This is useful specifically because it exposes whether lifecycle abstraction and dataflow abstraction are being conflated.

### 9. Control flow vs dataflow

**Does a graph edge represent execution dependency, data dependency, or both?**

If separated:
- how does a process identify data it consumes?
- may it consume outputs other than those of its immediate predecessor?

The document explicitly raises this distinction. ai\-agent\-orchestrator\-proposal.md

### 10. Data accessibility

**What data is a process allowed to reference?**

Possible models include:
- direct predecessors only
- any causal upstream output
- named workflow data
- committed artifacts
- orchestration state
- some combination

This is better left as an investigation question until concrete dataflow requirements exist.

### 11. Task semantics

**What is a task in relation to workflow execution?**

Probe:
- Is it merely an initial objective?
- Is it a durable artifact?
- Can orchestration mutate/refine it?
- Are mutations committed?
- What survives an interrupted workflow run?

This develops the document's currently broad task definition. ai\-agent\-orchestrator\-proposal.md

### 12. Task refinement

**Can execution modify the task being executed, and if so, is task modification an orchestration operation or ordinary process output?**

This is the core question behind the document's task-refinement section. ai\-agent\-orchestrator\-proposal.md

### 13. Task lifetime vs run lifetime

**Is a task scoped to one workflow run, or can the same durable task survive interrupted or multiple workflow executions?**

Follow-up when relevant:

**Can different executions of the same task use different workflow definitions?**

These are model questions; crash recovery mechanics are not.

### 14. Workflow completion

**What does successful completion of a workflow mean?**

Possible models:
- topology-derived completion
- explicit terminal construct
- some explicit workflow outcome

A useful follow-up is whether successful workflow completion necessarily means the task itself is complete.

### 15. Static vs dynamic topology

**Is workflow topology fixed for the duration of a run, or may execution modify the graph?**

This sharply separates **task refinement** from **workflow refinement**.

### 16. Fan-out representation

**Is fan-out represented directly by multiple outgoing graph paths, or does the model require an explicit split construct?**

This tests whether the graph itself is authoritative topology. The current document favors graph-native fan-out. ai\-agent\-orchestrator\-proposal.md

### 17. Fan-in representation

**Is synchronization represented directly by converging graph paths, or does the model require an explicit join construct?**

If graph-native, determine whether any concrete requirement exists that actually requires richer join semantics. ai\-agent\-orchestrator\-proposal.md

### 18. Conditional routing completeness

**Must conditional routing account for every possible outcome?**

For example:
- conditions must be statically exhaustive,
- a default/else route is required where exhaustiveness cannot otherwise be established,
- or an unmatched outcome has defined semantics.

This is a topology-validity question, not a question about a particular branching workflow.

### 19. Cycles

**Are cycles legal in workflow topology?**

If yes:

**Must every cycle have an explicit termination bound or policy?**

And, at the model level:

**Where is that bound attached—transition, workflow, process, or another construct?**

Avoid descending into whether “5” counts edge traversals versus process executions unless that distinction becomes necessary.

### 20. Static validation

**Which workflow properties must be validatable before execution?**

Examples:
- references resolve
- graph structure is legal
- cycles satisfy required termination constraints
- required routing is complete

The broader question is whether statically detectable invalidity is allowed to survive until runtime.

### 21. Failure semantics

**What is failure in the orchestration model?**

Possible interpretations:
- process execution outcome
- graph-visible state/value
- exceptional engine condition
- combination

The document currently leaves several possibilities open. ai\-agent\-orchestrator\-proposal.md

### 22. Retry ownership

**Where does retry policy belong?**

Distinguish:
- process execution policy
- workflow topology
- process implementation/provider
- combination

This is useful because modeling ordinary retries as graph loops materially changes the topology abstraction.

### 23. Failure after retry exhaustion

**Once process-level recovery/retries are exhausted, how does failure interact with workflow control flow?**

This should remain separate from the question of who owns retries.

### 24. External events

**How do external events affect orchestration?**

Useful competing models:
- events directly trigger graph transitions
- events modify orchestration state, after which ordinary graph evaluation determines what happens
- external events are modeled as processes
- unsupported/deferred

### 25. Orchestration state

**Does the model require orchestration state distinct from task state and process state?**

If yes, immediately ask:

**Does its representation belong in the configuration model now, or should it remain conceptual until concrete requirements exist?**

### 26. Human interaction

**Is human interaction/approval a process, an external orchestration event/state change, or a separate primitive?**

This is worth investigating, but only when there is a real human-in-the-loop requirement. Otherwise it invites premature abstraction.

### 27. Workflow membership

**Does a workflow explicitly declare its processes, or is membership derived from graph references?**

This tests whether the configuration has two sources of truth for topology/membership.

### 28. Entry semantics

**Must a workflow explicitly declare its starting point, or can entry nodes be derived from topology?**

This is a legitimate configuration-model question, although lower priority than the semantic questions above.

### 29. Identity and references

**What identity guarantees does the model actually require for workflows, processes, agents, and runtime process instances?**

Only then investigate syntax such as logical names, paths, local IDs, global IDs, etc. The document correctly leaves reference syntax open. ai\-agent\-orchestrator\-proposal.md

### 30. Configuration boundary

**Which properties belong to workflow, process, reusable agent/runtime configuration, and provider-specific configuration?**