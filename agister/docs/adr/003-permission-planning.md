---
date: 2026-10-14
model: claude-opus-5-5
description: "ADR-003: permission planning: processes speak permissions, runtime mappings offer primitives, resolve plans each node, runtimes are used as shipped"
---

# ADR-003: Permission planning and runtime facts

- **Status:** Proposed
- **Date:** 2026-10-14
- **Scope:** the permission vocabulary, how a process's permissions meet a
  runtime's options, the plan resolve makes for each node, and the facts
  about runtimes resolve relies on
- **Decision type:** Architecture

## Context

A process says what its work may do: read the repository, write it, run
commands, reach the network. Each runtime offers its own options for
that: Codex has sandbox modes, Claude Code has tools, others have flags.
A process must not be written for one runtime, and a runtime must not
learn what a process is (ADR-001, parts). The runtimes enforce their own
options, and do so as well as they do; Agister cannot do better and does
not try (ADR-001, invariant 10).

## Decision

Processes speak permissions; runtime mappings say which permissions each
runtime option grants. Resolve plans each node from the two, and the
runtime wrapper gets the plan's options, never permissions. A required
permission is the one hard check; anything the plan grants beyond what
the process allows is a warning, not a refusal.

## Rules

### 1. The mappings' grants are the vocabulary

A permission is a name a runtime mapping grants, such as
`repository.read` or `network`; what it means is what the mappings grant
under it.

### 2. A process speaks permissions

A process names the permissions its work requires and the ones it
allows. A process names no runtime option.

### 3. A runtime mapping offers options

A runtime mapping is a settings document for one runtime wrapper. It lists
the runtime's documented options, each with the permissions it grants,
and says whether a call takes one of them or any number. It describes the
runtime as shipped: no workarounds, no undocumented flags.

### 4. Resolve plans each node

For each node, resolve plans from its process's permissions and its
agent's runtime mapping which options to grant. A plan gives every
required permission, stays within what is allowed as far as the
runtime's options let it. It records what was required, allowed,
granted, granted beyond the allowed (`extra`) and withheld.

### 5. What refuses and what warns

A plan that cannot give a required permission refuses the node's
workflow at resolve, as does a node that needs what its runtime cannot do
(rule 7). Grants beyond what the process allows are a warning, shown by
check and carried in the call's result; they do not change its status.

### 6. Runtime wrappers are permission-blind

A runtime wrapper gets the options to use, never permissions, processes or
plans. It runs its runtime as shipped: the runtime loads the repository's
instructions and skills as it would for a person in the same directory,
and the call's own skills are given to it in the runtime's own way.

### 7. Resolve relies on runtime facts

What a runtime wrapper can do is a fact resolve needs and does not own:
the contract a mapping is written for, its version, whether it takes
skills, the efforts it accepts. Resolve declares a port
for these facts; the composition answers it from the wrappers. A node
that needs what its runtime cannot do is refused at resolve.

### 8. An unverified runtime version warns

A mapping says which runtime versions its options were checked on. A call
on another version warns and runs on the mapping as written.

## Consequences

- A process runs on any agent whose runtime it can be planned on, and
  the same process on two runtimes gets two plans.
- Adding a runtime is a wrapper, its mapping, and its facts answered in
  the composition; no process changes.
- Agister is no sandbox: the plan is what it asks of the runtime, and the
  runtime's own enforcement is what holds.

## Open

- **Resuming a session.** Whether resolve or `core/admit` checks that a
  runtime can resume one.
- **Checking a version.** Whether a wrapper may probe an unverified
  version, and where what it found is kept.
