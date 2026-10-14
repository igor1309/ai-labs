---
date: 2026-10-14
model: claude-opus-5-5
description: "ADR-002: what settings are, how their layers compose, what a problem in them refuses, and what check reports"
---

# ADR-002: Settings

- **Status:** Proposed
- **Date:** 2026-10-14
- **Scope:** the settings documents, their layers and composition, the
  references between them, what a problem or a block refuses, and what
  `check` reports
- **Decision type:** Architecture

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

This ADR decides what `settings/layout`, `settings/documents`,
`settings/resolve` and `settings/check` do. Permission planning, the
fields of the service settings and installing into home come in ADRs of
their own.

## Decision

Settings are named documents of known kinds in up to three layers. A
document is composed field by field from the layers that hold it, and
resolved with the documents it references. A problem belongs to one
document, and refuses only what depends on it; what cannot be attributed
stops every command. A repository blocks documents by name.

## Rules

### 1. A document is a kind and a name

A layer is a directory holding a folder per kind and the singletons.

| Kind | File | Composed (rule 4) |
|---|---|---|
| service | `service.toml` (singleton) | yes |
| agent | `agents/<name>.toml` | yes |
| process | `processes/<name>.yaml` | yes |
| workflow | `workflows/<name>.yaml` | yes |
| runtime mapping | `runtimes/<name>.yaml` | yes |
| verification | `verifies/<name>.yaml` | yes |
| brief form | `briefs/<name>.yaml` | yes |
| schema | `schemas/<name>.json` | no: taken whole |
| prompt | `prompts/<name>.md` | no: taken whole |
| skill | `skills/<name>/SKILL.md` | no: taken whole |
| blocks | `blocks.yaml` (singleton, repository layer only) | no |
| layer | `layer.yaml` (singleton, repository and project layers) | no |

A document's identity is its kind and its name, the file's name without
its extension; a singleton's is its kind. Nothing else joins documents
across layers: a `name` a file sets must be the file's name. A name
follows one naming rule for every kind.

A YAML file holds exactly one YAML document. A file's `schema` names its
kind and version.

### 2. Three layers, each over its parent only

- **home**: `~/.agister` (`$AGISTER_HOME`, `--home`);
- **repository**: `<root>/.agister`, where `<root>` is the root of the git
  worktree that holds the launch directory;
- **project**: `<dir>/.agister`, where `<dir>` is the nearest directory
  below `<root>` that holds one, from the launch directory upward.

The launch directory is where the command is launched, or `--dir`. Every
command that reads settings takes `--dir`, so what a call launched there
would get is read without launching it. The project layer is over the
repository layer, and that over home. No layer reads a sibling.

Launched at `<root>`, or under no directory that holds `.agister/`, there
is no project layer. Outside a git worktree only home is read. A
`.agister` that is home itself is no layer.

The layers select settings, not the place of work: a call works in the
worktree, wherever in it the command is launched.

### 3. A layer can be invalid

A layer is invalid when:

- a second `.agister/` stands between the project layer's directory and
  `<root>`: there is no fourth layer;
- it is a project layer holding `blocks.yaml`;
- its `layer.yaml` is unreadable or invalid, or lists a folder that does
  not exist, is not a folder, or is not inside the directory that holds
  the layer's `.agister/`, by an absolute path, a `..` or a link that
  leaves.

Home holding `blocks.yaml` or `layer.yaml` is not invalid: each is a
problem that refuses nothing, and is not read.

An invalid layer stops every command launched under it, except those rule
9 exempts. `check` names the layer, the path at fault and the reason. A
command launched elsewhere in the worktree does not read that layer.

### 4. A composed document is set field by field

A layer's file of a composed kind holds the fields that layer sets: one
YAML mapping or one TOML table, complete or not. The document is composed
from home toward the launch directory:

- **A map merges by key, at every depth.** A key only the farther layer
  holds is kept; a key only the nearer holds is added after the farther
  one's keys; a key both hold keeps the farther one's position.
- **A list or a scalar replaces whole.** `[]` is the list of none.
- **Unlike values replace whole:** a map over a scalar or a list, or the
  reverse.
- **Nothing unsets.** An empty map over a map changes nothing; `null` is a
  scalar and replaces.

A TOML table is a map, an array a list.

The composed document is what is checked: required fields, references,
limits and the rules across fields. A document one layer alone holds must
be complete there. A layer file that cannot be read or parsed breaks the
document; the farther layers' files do not stand in for it.

A schema, a prompt and a skill are taken whole from the nearest layer
that holds them. `blocks.yaml` and `layer.yaml` are read for their own
layer only.

### 5. A process may extend one base

```yaml
name: tests_review
extends: process:review
prompt: code-review-tests
```

- A base is a process another process extends. It extends nothing.
- The base is composed from its layers first, then the extending process's
  layers over it, each farthest first. `name` and `extends` are never
  taken from the base.
- A layer's partial of the base reaches every process that extends it. The
  nearest layer that holds the whole process says what it extends; a
  partial cannot set `extends`.
- A base is not work: a node that binds it is a problem of the workflow.
  A base is checked through each process that extends it, and may leave
  out what they set.

Only processes extend.

### 6. References

Every reference is a literal name, fixed by the settings and never
interpolated, so it resolves without a call.

- **A workflow node binds a process to an agent:**
  `{node: tests, uses: process:tests_review, agent: codex-sol-61}`.
  `agent` is required on every node; nothing else chooses an agent. A
  workflow is `call` (one node) or `fan_out` with `join`. `fan_out` is a
  list, so a layer that rebinds one node gives the whole list; `call` and
  `join` are maps, and a layer may set `call.agent` or `join.agent`
  alone.
- **An agent** names its runtime mapping and its skills.
- **A process** names its `prompt` (required), its `guidance` (a list of
  further prompts), its output schema, its skills, its verification
  (`verify: verify:<name>`, or inline fields), and the brief form an input
  takes.
- **A prompt** of a layer is its `prompts/<name>.md`, else `<name>.md` in
  each folder its `layer.yaml` lists, in order. A listed folder is read
  only for names a process gives; its other files are not settings.

A process's call gets its prompt as the input `prompt` and each guidance
prompt, in order, as `guidance.<name>`, each with its digest. What a node
must follow is in its prompt or guidance: nothing relies on an agent
following a pointer in `AGENTS.md` or a skill.

### 7. Resolve follows the chain

Resolve takes a request naming any document by kind and name; a workflow
or a process comes with its parameters. It composes that document and
every document it reaches through references, and gives the resolved
settings or a refusal. A workflow's nodes resolve against the layers of
its launch directory; a node selects no layers of its own.

What a request depends on is what it reaches. A broken runtime mapping
therefore refuses every workflow with a node on an agent that uses it.
A refusal names the chain to the document at fault, its path and each of
its problems:
`workflow implement_codex: node implement: agent codex-sol-61: runtime
mapping codex: unknown adapter "codex2"`.

A refused request never reaches core, and no run is recorded (ADR-001,
rule 4).

### 8. A problem belongs to one document

A problem of a document refuses what depends on that document, and
nothing else. A document's problems are its own: it cannot be parsed, a
field is invalid, a reference names no document in any layer, a limit
does not compose. A problem of a binding (a node's process cannot run on
its agent) is the workflow's, naming the node: another workflow that
binds the same process to another agent runs.

A document with problems that nothing uses refuses nothing.

A referenced verification that no layer holds is a warning, not a
problem: the settings pass, and only a call of a process that names it is
refused, naming the reference and every path it was expected at.

### 9. What cannot be attributed stops every command

These stop every command but `init`, `install`, `install --restore`,
`check`, cancelling a run and following a run:

- the service settings are missing, unreadable or invalid: every document
  is checked against them;
- a file or a skill folder whose name is not a name, or a settings
  folder that cannot be listed: nothing can name what it holds;
- a workflow named like a process: a name a command takes would not say
  which it means;
- an invalid layer (rule 3), for commands launched under it;
- a broken `blocks.yaml` (rule 10).

### 10. A repository blocks what home allows

`<root>/.agister/blocks.yaml` lists documents the repository refuses:

```yaml
schema: agister.blocks/v1alpha1
blocks:
  - ref: agent:codex-sol-61
    reason: Codex does not implement here
  - ref: workflow:implement_pi
```

- An entry names an agent, a process, a workflow or a runtime mapping,
  and may give a reason. Other kinds are not choices a call makes; block
  what names them.
- A request that depends on a blocked document is refused as for a
  problem (rule 7); the refusal names the chain, then the block, its path
  and its reason. A block applies whichever layer the document comes
  from.
- A block on a document that has problems blocks it as written; its
  problems are reported as before.
- A block is not a problem: settings with blocks pass `check`.
- A `blocks.yaml` that is unreadable or invalid, or names a document no
  layer holds, stops every command in the repository (rule 9): what it
  was meant to block cannot be known.

### 11. Check reports every problem and what it refuses

`check` lists every document's name and resolves each, so a document
nothing uses is checked too. It reports every problem, each with what it
refuses, or that it refuses nothing, or that it stops every command; each
block with what it refuses; and the warnings. It exits non-zero on any
problem.

A problem that names a field, a field's shape, an adapter, an input
source or a schema version this binary does not know is marked, and a
line after the problems says the settings may need a newer binary. A
known field with a wrong value is not marked. Every refusal that such a
problem causes says the same.

`check --tree`, `process show` and `workflow show` give each document's
layer files, nearest first, and the layer each field came from, the base
included. Listings show each refused workflow and process with its
refusal. A write into home is refused if it adds a problem; problems
already there do not stop it.

### 12. A run records its definitions

A call's record holds each definition it ran on, with the layer files it
was composed from, nearest first: each file's layer (`home`,
`repository`, `project`), path, digest and the fields it gave, a field
being the dotted path of a leaf. A document taken whole names its one
file. The record also names the directory of each layer the call read.

## Consequences

- A repository changes one field of a home document with a partial, and
  can see in `check --tree` which layer gave each field.
- Broken or blocked settings refuse only what uses them, so one bad file
  never stops unrelated work; the few problems that cannot be attributed
  stop everything, loudly.
- A refusal from settings leaves no run. It is reported on stderr, and
  `check` shows the same problem before any call.
- Composition happens in `settings/documents` and the reference chain in
  `settings/resolve`; `settings/layout` alone knows paths and folders.

## Open

None.
