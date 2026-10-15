---
date: 2026-10-14
model: claude-opus-5-5
description: "ADR-002: settings: documents in layers, composed by field, resolved by reference, blocked by kind and name"
---

# ADR-002: Settings

- **Status:** Accepted
- **Topic:** Settings
- **Date:** 2026-10-14
- **Scope:** the settings documents, their layers and composition, the
  references between them, blocks, and what resolve and check do with them
- **Decision type:** Architecture
- **Amended by:** ADR-011 (2026-10-15)

## Context

Agister's agents, processes, workflows and the rest are defined in
settings files, not in code (ADR-001, invariant 2). The files sit in up to
three layers: home, the repository, and a project inside the repository.

- A nearer layer must be able to change one field of what a farther layer
  defines, without copying the rest.
- A layer cannot remove what a farther layer defines. A repository that
  must not use something home defines needs another way to say so: it
  blocks it.
- A problem in one document must not stop work that does not use it.

Terms used here:

- **settings**: the files in the layers;
- **document**: a kind and a name, held by one or more layers' files;
- **definition**: a document composed from its layers' files, as resolve
  gives it and a run records it.

## Decision

Settings are named documents of known kinds in up to three layers. A
document is composed field by field from its layers and from what it
extends, and resolved with the documents it references. Resolve is the
gate before a run; check is built on it. A repository blocks documents by
kind and name.

## Rules

### 1. A document is a kind and a name

Each kind has its folder in a layer, and a document is the file named
after it: `agents/<name>.toml`, `processes/<name>.yaml`,
`workflows/<name>.yaml`, `runtimes/<name>.yaml`, `briefs/<name>.yaml`, `schemas/<name>.json`, `prompts/<name>.md`,
`skills/<name>/SKILL.md`. Nothing but kind and name joins files across
layers.

### 2. Three layers, each over its parent

- **home**: `~/.agister`;
- **repository**: `.agister` at the root of the git worktree holding the
  launch directory;
- **project**: the nearest `.agister` below that root, from the launch
  directory upward.

The launch directory is where the command is launched, or `--dir`. A
layer is over its parent alone: project over repository, repository over
home. Outside a git worktree only home is read. The layers select
settings, not the place of work.

### 3. A document is composed field by field

From home toward the launch directory, maps merge by key at every depth,
and lists and scalars replace whole: a list's items are never merged,
by name or otherwise. Nothing unsets. The composed
document is what is checked. Schemas, prompts and skills are taken whole
from the nearest layer that holds them.

### 4. A composed document can be extended

A document of a composed kind is extended by the nearer layers that hold it, and by another
document of its kind that names it in `extends`. The extended document is
composed first, then the extending document over it, by rule 3.
`extends` is a field like any other.

### 5. References are literal names

A document names the documents it uses by kind and name, fixed in the
settings, so they resolve without a call. A workflow names its
children: an agent invocation, which binds a process to an agent, a
command execution, or another workflow (ADR-011, rule 2). Nothing but an
agent invocation chooses an agent. A process names its prompt, its
guidance, its output schema and its skills; an agent names its runtime
mapping and its skills.

### 6. Resolve is the gate

Resolve takes a request naming a document by kind and name, composes it
and everything it references, and gives the definitions or a refusal. A
refusal names the chain to the document at fault and its problem.

A problem in a document refuses what depends on it, through any chain,
and nothing else. A problem that belongs to no document, such as a layer
that cannot be read, refuses every request.

A workflow that resolves may run; what is refused never reaches core, and no run is
recorded (ADR-001, rule 4).

### 7. A repository blocks what home allows

The repository layer's `blocks.yaml` names documents, by kind and name,
that the repository refuses, each with a reason. A request that depends
on a blocked document is refused as for a problem, naming the block. A block is not a problem.
A block naming no document is a warning.

### 8. Check is built on resolve

Check is handed resolve. It lists every document and resolves each, so a
document nothing uses is checked too, and reports every problem with what
it refuses. It also shows, for each definition, the layer each field came
from.

## Consequences

- A layer changes one field of a document without copying it, and a
  document reuses another by extending it.
- One broken or blocked document refuses only what uses it.
- A refusal by resolve leaves no run; check shows the same problem before
  any call.
