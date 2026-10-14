# ADR-030: A workflow binds a process to an agent

- **Status:** Accepted
- **Date:** 2026-10-10
- **Scope:** what an agent, a process and a workflow each hold; where a
  call's agent is chosen; what `agister run` runs; how processes share
  fields
- **Decision type:** Architecture
- **Amends:** [ADR-001](001-agister-cli-architecture.md): the agent,
  process and policy of its vocabulary, limits narrowing "from service to
  policy to process to caller", and continuation "only for agents" that
  allow it;
  [ADR-002](002-verify-and-bounded-repair.md) rule 4, which needs "an
  agent whose sessions may be continued";
  [ADR-003](003-fan-out-and-join-workflow.md): a node's fields and the
  one fixed shape;
  [ADR-015](015-a-broken-document-refuses-only-what-uses-it.md) rules 1
  and 2, [ADR-018](018-a-repository-blocks-what-home-allows.md) and
  [ADR-021](021-settings-give-an-agent-its-skills.md), where each has the
  caller's `--agent`;
  [ADR-024](024-a-stale-call-is-resumed-once.md) rule 5, "a policy sets
  it, and a process may only lower it", and rule 6;
  [ADR-028](028-settings-are-layered-by-field.md) rule 1, "no `extends`",
  its non-decision on `extends`, and rule 6's list of composed kinds
- **Relates to:** [ADR-010](010-a-process-names-its-verification.md),
  [ADR-025](025-a-call-works-where-it-is-called.md),
  [ADR-026](026-the-brief-is-a-runs-input-contract.md),
  [ADR-027](027-homes-settings-have-one-source-in-git.md)
- **Source:** LAB-171; the owner's decisions, 2026-10-10, and his
  refinements of the same day on `extends` and `session`; accepted by
  the owner, 2026-10-10, after `adr_review` `20261010T095548Z-bac87a`

## Context

A process names its agent (`uses: agent:<name>`) and its policy
(`policy: process-policy:<name>`). A caller may run it on another agent
with `--agent`. A workflow's node names a process and nothing else.

Home's documents multiply along the agent:

- `implement`, `implement_codex`, `implement_pi` and `implement_pi_glm`
  differ in their agent and policy only. They have drifted: `implement`
  alone checks its brief's form (`form: [goal, step]`).
- The policies `implement`, `implement_codex` and `implement_pi` hold the
  same fields. Home has five policy documents of three contents.
- Five review processes differ in `name` and `prompt` only.
- `codex-sol-61` and `codex-implementer-sol-61` are one runtime, model and
  effort; so are `claude-judge` and `claude-implementer-opus`. Each pair
  differs in `session` only, which is there because the implementer's
  verification repairs in its session.
- This repository's layer sets the same `guidance` in four `implement*`
  files and in two review files.

A review runs its lenses on one agent and its judge on another, on
purpose. With the agent on the process, saying so takes a process per
agent. With `--agent`, it takes a caller that picks agents by judgement,
and the run is then not defined by its settings.

## Decision drivers

- Each fact has one document: the runtime's in the agent, the work's in
  the process, the choice of agent in the workflow.
- A run is defined by its settings alone: no caller chooses an agent.
- A permission a runtime cannot give is refused or shown, never explained
  in a comment.
- A layer still says only what it changes (ADR-028).

## Decision

An agent is a runtime profile. A process is work, and names no agent. A
workflow binds each node's process to an agent, and is the only thing
`agister run` runs. Policies go: a process holds its own access, tools
and limits. A process may extend one base process of its layer.

## Rules

### 1. An agent holds what is its runtime's

`runtime`, `model`, `model_family`, `effort`, `command` and `skills`. It
loses `session`. It holds no limit: no runtime has a cap of its own
today, and the service's ceilings stay where they are (rule 4).

### 2. A process holds the work, and names no agent

A process loses `uses` and `policy`. It gains:

- the fields a policy holds, under the names they have there:
  `workspace.access`, `workspace.scope`, `tools.allow`, `isolation.deny`,
  `timeout`, `retry`, `max_cost_usd` and `stale`. A process's own
  narrowing overrides of today are these same fields;
- `session: resumable | fresh-only`, `fresh-only` when unset.

`tools.require` stays: the permissions the work cannot be done without.

### 3. Whether a call resumes is the process's to say

`session: resumable` says the work's session may be resumed: by a repair
turn (ADR-002 rule 4), a recovery turn (ADR-024 rule 6) or the caller's
`--continue`. A process whose verification repairs, or whose
`stale.recover.max_resumes` is above 0, and whose `session` is not
`resumable`, has a problem of its own, where today the problem was its
agent's. A runtime that cannot resume refuses the binding at the call, as
today.

### 4. Policies go

There is no policy document and no `policies/` in a layer; a file there
is a problem of the layer. Limits narrow from the service to the process
to the caller's `--timeout` and `--max-cost`. A nearer layer's field
replaces a farther one's (ADR-028 rule 4), as a layer's policy partial
did; the service's ceilings bound the result.

### 5. A workflow node binds a process to an agent

```yaml
fan_out:
  - {node: tests, uses: process:tests_review, agent: codex-sol-61}
join: {node: judge, uses: process:review_judge, agent: claude-opus}
```

`agent` is required on every node. Nothing else chooses an agent: there
is no `--agent`, on `run` or on `process show`. The agent's skills and
the process's are both given, each once (ADR-021).

### 6. A workflow has one of two shapes

The fan-out and join of ADR-003, or one call:

```yaml
schema: agister.workflow/v1alpha1
name: implement_codex
type: workflow
call: {node: implement, uses: process:implement, agent: codex-sol-61}
```

A workflow with `call` has no `input`, `fan_out` or `join`. Its params
are its process's, each with the process's default, and its inputs are
resolved by the process as for a call today. Its run is that one call's
run: one record, which names the workflow, the process and the agent,
and no node record. It takes `--timeout`, `--max-cost` and, where its
process is resumable, `--continue`, as a process's run did. A fan-out
workflow still cannot be continued.

### 7. `agister run` runs workflows only

`agister run <name>` names a workflow. A process's name is refused, with
the workflows that bind it. `process list` and `process show` stay: they
show the work, and no agent. `workflow show` shows each node as its
binding runs: agent, runtime, plan, the permissions withheld, limits.

### 8. A binding is checked before any run

`agister check` resolves every node of every workflow as a call would,
up to the runtime's installed version: the process, the agent, the
agent's runtime mapping and the plan (`enforce`). A binding is a problem
of the workflow, naming the node, when:

- the mapping gives no primitive within `tools.allow`;
- a permission in `tools.require` would be withheld;
- the agent's runtime mapping does not take the agent's `effort`, or any
  other problem a call on that agent has today.

A permission allowed and not required, which the runtime does not give,
is not a problem: `check` and `workflow show` list it as withheld on that
binding. What home's processes cannot work without, they say in
`tools.require`; `implement` requires `repository.write`.

The problem refuses the workflow, not the process or the agent
(ADR-015): another workflow that binds the same process to an agent that
can run it still runs.

### 9. A process may extend one base

```yaml
schema: agister.process/v1alpha1
name: tests_review
type: process
extends: process:review
prompt: code-review-tests
```

- A base is a process some process extends. It extends nothing: one
  level.
- A base is not work: a node that binds it is a problem of the workflow.
  It is checked through each process that extends it, so it may leave
  out what each of them sets, `prompt` here.
- Composition: the base from its layers, farthest first (ADR-028 rule
  4), then the extending process's layers over it, farthest first. Maps
  merge by key; lists and scalars are replaced whole. `name` and
  `extends` are never taken from the base.
- A layer's partial of the base reaches every process that extends it. A
  layer's partial may not set or change `extends`: the nearest layer that
  holds the whole document says it.
- `process show` and the record name, for each field, the base and the
  layer file that gave it.

Only processes extend. This is the sibling inheritance ADR-028 rule 1
left out: it is allowed here for a process and its one base, and nowhere
else.

### 10. A layer rebinds a node by giving the list

`fan_out` is a list, so a layer that changes one node's agent gives the
whole list (ADR-028 rule 4, as for `guidance`). `join` and `call` are
maps: a layer sets `join.agent` or `call.agent` alone.

A workflow whose node binds a blocked or broken agent is refused
(ADR-015, ADR-018) until a layer rebinds the node. There is no call that
routes around it.

### 11. Earlier runs stay readable, and are not continued

A record made before this ADR is read as it is: `runs list`, `runs
show`, `runs export` and Pages print the process and agent it names,
whether or not the settings still have them. A record holds its own
definitions and needs none of today's. `--continue` of such a run is
refused: its agent and process are not the ones a workflow now binds.

## Migration

The binary first reads both forms, then the settings move, then the old
form goes. No change moves the binary and home together, and home never
holds a field the installed binary does not know (`agister/AGENTS.md`,
LAB-122).

1. Tests that hold what must not change: what each of home's processes
   and workflows resolves to (agent, plan, limits, prompt, guidance,
   verification), and that records of today are read.
2. The binary reads a process's inline limits beside `policy`, `session`
   on a process beside the agent's, `agent` on a node beside the
   process's, `call`, `extends`, and the binding check as warnings.
3. Home moves, each step leaving what the first tests hold unchanged but
   where said:
   - the policies into their processes; `advisor` carries its own copy;
   - five agents for seven: `claude-opus`, `claude-sonnet`,
     `codex-sol-61`, `pi-glm-53`, `pi-m3`;
   - `agent` on every node of `code_review` and `adr_review`;
   - one `implement`, with `session: resumable`, `tools.require` and the
     brief's form, and a `call` workflow for each agent in use:
     `implement_opus`, `implement_sonnet`, `implement_codex`,
     `implement_pi`, `implement_pi_glm`. The three that did not check
     the brief's form now do: a change of behaviour, on purpose;
   - `review`, the base, and the review processes on it, named without
     `_codex`. `adr_review` and `clarity_review` gain the base's sentence
     on guidance, which they lacked.
4. The callers: the caller skill, `AGENTS.md`, the README, the settings
   diagrams and Pages.
5. The binary refuses the old form: `uses` and `policy` on a process,
   `session` on an agent, a node without `agent`, a policy document,
   `--agent`, and `agister run <process>`.

This repository's layer follows home in step 3: `guidance` once on
`implement`, and on `review` for the reviews that share it.

## Consequences

- Home has one `implement`, one `review` base with five processes of
  three lines, no policies and five agents.
- Running the implementer on another agent is a workflow of five lines,
  committed, where it was a flag. An experiment that compares agents
  adds a workflow for each.
- A review on other agents is another workflow that lists every node.
- A repository that blocks an agent must rebind each workflow that binds
  it, or lose the workflow.
- `agister run implement` no longer exists; every caller names a
  workflow.
- A reviewer's permissions and limits are the base's: a change for one
  review is set on that process, and reaches no other.
- `check` reports a binding that cannot run before anyone runs it.
- An agent says nothing of the work, so one agent serves a reviewer and
  an implementer.

## Alternatives considered

- **One process per role; the node or the caller gives the prompt.**
  Rejected by the owner: a review's prompt is the review. On the node,
  the workflow would define the work.
- **The process keeps a default agent; the workflow or `--agent`
  overrides it.** Rejected by the owner: a caller that assembles the
  agents of a review decides by judgement what the settings should say.
- **Bare process runs stay, for the single call.** Rejected by the
  owner: two ways to run, and the agent of the second is again the
  caller's or a default's.
- **Policies stay, as three documents.** Once `implement` is one
  process they no longer repeat. Rejected: a process then shares fields
  two ways, by a named policy and by a base, and `extends` covers both.
- **`session` on the node.** Rejected: it does not vary by binding, and
  a node could contradict its process's verification.
- **The review processes repeat their shared fields.** It keeps ADR-028
  rule 1 whole. Rejected by the owner for `extends`, kept narrow.
- **A map of node names to agents, so a layer rebinds one node.**
  Rejected: two places that bind, the node and the map.
- **Limits on the agent, the stricter of the two applied.** Rejected for
  now: no runtime has a cap to record. See the non-decisions.

## Explicit non-decisions

A cap of an agent or of a runtime, and how it would combine with a
process's limits; `extends` for a workflow, an agent or any other kind;
a base that extends a base; lists merged by a key; `--continue` of a
fan-out workflow; `--timeout` and `--max-cost` on a fan-out workflow; a
workflow named like a process; whether `input.instruction` moves into
the prompt (ADR-028); the names of home's workflows and agents beyond
this migration; continuing a run made before this ADR.
