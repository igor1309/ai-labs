---
date: 2026-10-15
model: claude-opus-5-5
description: "The facts behind index.html, each with its ADR: what settings define, where they live, how they compose and resolve, and the parts that own them"
---

# Settings architecture: notes

The facts behind `index.html`, each with its source. ADRs are
`agister/docs/adr/`, as amended by ADR-011, ADR-012 and ADR-013
(2026-10-15) and revised 2026-10-16 (ADR-002 rule 1, ADR-013 rule 1).
The page states no syntax: settings syntax is specified in
`settings/documents`' feature files (ADR-011, non-goals).

## Three axes

- Settings define; records hold what executed; code is the machinery.
  (ADR-012, terms)
- Definitions: workflow, step, process, agent, runtime mapping; a
  workflow's bindings and conditions are part of it. A definition is declared, resolved and planned; it never
  runs. (ADR-012, terms)
- Executions: a run executes a workflow, a call executes a step;
  iteration, turn, session. (ADR-012, terms; ADR-001, decision)
- Machinery: runtime, runtime facts, program, hold, supervisor; the
  page names only the runtime and its facts, which settings meet; the
  rest is core's. (ADR-012, terms)
- A step's inputs and output contract are its process's. (ADR-010,
  rule 1; ADR-012, terms)
- A body's execution is an iteration; every other child executes once,
  as a call or a run. (ADR-011, rule 2)

## What settings define

- Definitions live in settings, not in code; code adds only a runtime or
  an input source kind. (ADR-001, invariant 2)
- A workflow defines work by its inputs, its output contract and its
  children, composed by sequence, parallel, branch or bounded
  repetition. A child is a step or a workflow. (ADR-011, decision and
  rules 2 and 3; ADR-012, rule 1)
- A step binds a process to an agent; nothing but a step chooses an
  agent. (ADR-002, rule 5; ADR-012, rule 1)
- A process: prompt, inputs, environment, output schema, permissions,
  limits; it names its prompt, guidance, output schema and skills.
  (ADR-002, rule 5; ADR-011, rule 1; ADR-012, terms)
- An agent: a runtime mapping, and the model, effort and skills its
  runtime takes; a bash agent names only the runtime. (ADR-002, rule 5;
  ADR-012, terms and rule 2)
- A runtime mapping: what its runtime grants with no option, and its
  options with what each grants; bash offers no options. (ADR-003,
  rule 3; ADR-012, rule 4)
- A prompt is the text a runtime is given: a message to a model, a
  script to bash. (ADR-012, rule 2)
- A text input may name brief forms; a form is a settings document.
  (ADR-010, rule 5)

## Kinds and files

- A document is a kind and a name, the file named after it in its
  kind's folder (ADR-002, rule 1). The folders and files are
  `settings/layout`'s: `agents/<name>.toml`, `processes/<name>.yaml`,
  `workflows/<name>.yaml`, `runtimes/<name>.yaml`,
  `brief-forms/<name>.yaml`, `schemas/<name>.json`, `prompts/<name>.md`,
  `skills/<name>/SKILL.md`, which layout does not read yet
  (`backlog/skills.md`). (`settings/layout/reading.feature`,
  `names.feature`)
- The repository layer's `blocks.yaml` names documents it refuses, each
  with a reason. (ADR-002, rule 7)

## Layers and composition

- Three layers: home (`~/.agister`), the repository (`.agister` at the
  root of the git worktree holding the launch directory), the project
  (the nearest `.agister` below that root). Each is over its parent
  alone; outside a git worktree only home is read. (ADR-002, rule 2)
- From home toward the launch directory, maps merge by key at every
  depth; lists and scalars replace whole; nothing unsets. Schemas,
  prompts and skills are taken whole from the nearest layer. (ADR-002,
  rule 3)
- `extends` names a document of the same kind, composed first; the
  extending document is composed over it. (ADR-002, rule 4)

## Resolve and check

- References are literal names, fixed in settings, so they resolve
  without a run. (ADR-002, rule 5)
- Resolve takes a request naming a document by kind and name (a
  workflow with its parameters), or a step, a process and an agent,
  composes it and all it references, and gives definitions or a refusal
  naming the chain. A step requested alone resolves as a workflow of
  that one step, which is no document. (ADR-002, rule 6; ADR-001,
  settings; ADR-013)
- Resolve follows references, applies blocks, checks boundaries and
  bindings, plans each step's permissions, and refuses, with the request
  that holds it, a step that needs what its runtime cannot do, in
  unselected branches too.
  (ADR-001, settings; ADR-003, rules 4, 5 and 7; ADR-011, rule 6)
- A plan gives every required permission or refuses; what it grants
  beyond the allowed is a warning. (ADR-003, rules 4 and 5)
- A problem refuses only what depends on it; a problem that belongs to
  no document refuses every request; a block refuses as a problem does.
  (ADR-002, rules 6 and 7)
- What does not resolve never reaches core and leaves no run. (ADR-001,
  rule 4)
- Check is handed resolve, resolves every document, and reports every
  problem with what it refuses; inspect shows each definition with the
  layer each field came from. (ADR-002, rule 8; ADR-001, settings)
- Install writes only home's settings, keeps what it replaces, and works
  on a broken home; restore undoes an install. (ADR-008)

## Parts

- `settings/layout`: where settings live; a kind and name to a file;
  lists names. Ports: filesystem; worktree root. (ADR-001, settings)
- `settings/documents`: bytes to typed definitions with per-field
  provenance; format, layering, kinds. Pure. (ADR-001, settings)
- `settings/resolve`: a request to definitions or a refusal. Ports: a
  document source; runtime facts. (ADR-001, settings)
- `settings/check`: check and inspect, built on resolve. Ports: resolve;
  list names; a document's fields, each with its source. (ADR-001,
  settings)
- `settings/home`: install and restore. Ports: filesystem writes; clock.
  (ADR-001, settings; ADR-008)
- No settings package imports another; the composition assembles the
  document source from `layout` and `documents`, hands `check` a
  resolve, and answers runtime facts from the wrappers. (ADR-001,
  rule 1 and settings)
- Core takes resolved settings: the workflow, and every step's process,
  agent, runtime mapping and permission plan. Core never reads settings
  files. (ADR-001, core and rule 4)
