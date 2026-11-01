# ADR-018: A repository blocks what home allows

- **Status:** Accepted
- **Date:** 2026-10-03
- **Scope:** how a repository's settings take away a process, workflow,
  agent or runtime mapping that home's settings provide
- **Decision type:** Architecture

## Context

A repository's settings (`<repository>/.agister`) are read over home's
(`~/.agister`) document by document: a repository document takes priority
over home's document of the same kind and name (`fsdefs.Layered`). So a
repository can add a document or replace one, but it cannot take one away.

Repositories need to take away a choice they inherit: home provides a
process, an agent or a runtime that one repository must not use, while
every other repository keeps it. Replacing documents is the only way
today, and it pulls the other way: a repository that copies home's
documents to edit them drifts from home, and home's later changes no
longer reach it. Replacing a process with a document that cannot run is
not a way either: it is a broken document, which `check` reports as a
problem.

[ADR-015](015-a-broken-document-refuses-only-what-uses-it.md) already
refuses exactly the calls that depend on a document, through any chain
of uses, and names the chain in the refusal. A block can refuse the same
way.

## Decision drivers

- A repository takes away a choice without copying any of home's
  documents.
- A blocked choice never runs in that repository, through any chain of
  uses, the caller's `--agent` included.
- The block and where it comes from are as easy to find as a problem:
  `check` and every refusal name it.
- Repositories without a block, and every other repository, behave as
  today.

## Decision

A repository lists the documents it blocks in `<repository>/.agister/blocks.yaml`.
A blocked document refuses, in that repository, every call that depends on
it, as ADR-015 refuses a call that depends on a broken document. A block
wins over any document of that kind and name in either layer.

## Rules

### 1. Blocks are one document of the repository

`blocks.yaml` is a singleton, like the service settings:

```yaml
schema: agister.blocks/v1alpha1
blocks:
  - ref: agent:codex-implementer-sol-61
    reason: Codex does not implement in this repository
  - ref: process:implement_codex
```

Each entry names one document by the reference the settings already use
for it (`process:`, `workflow:`, `agent:`, `runtime:`) and may give a
reason. The other kinds are not blocked: a policy, schema, verification or
prompt is not a choice a call makes, and blocking one only refuses the
processes that name it.

Only the repository's layer is read for blocks. Home's settings decline a
choice by not defining it; a `blocks.yaml` in home is reported by `check`
as a problem of home's settings, and blocks nothing.

### 2. A block refuses what depends on the blocked document

A call depends on documents as ADR-015 rule 1 has it. A call that depends
on a blocked document is refused before its first turn
([ADR-001](001-agister-cli-architecture.md) rule 7) and recorded like any
refusal. A block on an agent is evaluated against the resolved call
(ADR-015 rule 2): `--agent` naming a blocked agent is refused, and
`--agent` naming another agent runs a process whose own agent is blocked.

A workflow is refused before any of its nodes' turns when any node's
resolved call depends on a blocked document.

The block applies whichever layer the blocked document comes from, the
repository's own included.

### 3. The refusal names the block

A refusal for a block names the chain to the blocked document, as ADR-015
rule 3 does, then the block, its path and its reason:
`process implement_codex: agent codex-implementer-sol-61 is blocked by
/repo/.agister/blocks.yaml: Codex does not implement in this repository`.

### 4. `check` shows each block and what it refuses

A block is not a problem: settings with blocks pass `check`. `check`
lists each block, its path and reason, and the processes and workflows it
refuses. Listings and views show each refused process and workflow with
the refusal, as they do for a problem.

### 5. A broken block list stops every command

`blocks.yaml` that is unreadable or invalid, or that names a document
that exists in neither layer, is a problem that cannot be attributed
(ADR-015 rule 4): what it was meant to block cannot be known, and running
anyway could run what the repository blocks. It stops every command in
that repository, except those ADR-015 rule 4 exempts and `agister
install` and `install --restore`, which ADR-016 rule 9 keeps outside the
check: a broken `blocks.yaml` never removes the way to repair or restore
the settings.

A block on a document that exists but has a problem of its own blocks it
as written; the document's problem is reported as before.

### 6. Install does not install blocks

`agister install` (ADR-016) installs settings into home, and home has no
blocks (rule 1). A `blocks.yaml` in the installed folder is reported and
not installed, as a file that is not a settings document is (ADR-016
rule 1).

## Consequences

- A repository stops Codex implementing with two lines and no copy of
  home's documents; home's later changes to those documents still reach
  it.
- What a repository blocks is visible only in that repository: the same
  process runs elsewhere. `check` and each refusal say why it does not
  here.
- A typo in a block stops every command in that repository until fixed,
  rather than blocking nothing unnoticed.
- A repository can still widen what home allows by replacing a document,
  as today. This ADR adds a way to narrow; it does not change replacing.

## Alternatives considered

- **Blocks in the repository's service settings.** Rejected: the
  repository's `service.toml` replaces home's whole, so adding a block
  there means copying home's service settings, which then drift from
  home's.
- **A stub document that replaces the blocked one.** Rejected: it is a
  broken document, a problem `check` reports, and it says nothing of why.
- **Blocks in home too, overridden by the repository's.** Rejected: a
  repository's `blocks.yaml` would replace home's whole, so keeping home's
  blocks means copying them; and home declines a choice by not defining
  it.
- **Block permissions instead of documents** (deny `network` for every
  call in the repository). Not rejected, not decided: it narrows limits
  ADR-001 rule 3 composes, a different layer from the choices this ADR
  takes away.
- **Skip blocked documents silently.** Rejected: a call would run on
  another agent than the one it names, and ADR-001 rule 7 asks for a
  refusal.

## Explicit non-decisions

Whether `agister pages` (ADR-009) shows blocks; blocking permissions for a
whole repository; whether a repository can block a kind rule 1 leaves
out.
