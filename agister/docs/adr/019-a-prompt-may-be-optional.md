# ADR-019: A prompt may be optional

- **Status:** Proposed
- **Date:** 2026-10-03
- **Scope:** a process's prompt input that some repositories supply and
  others do not
- **Decision type:** Architecture
- **Amends:** [ADR-014](014-prompts-are-settings.md) rule 4: a missing
  prompt is a problem of the process, unless its input is optional

## Context

A process gives its agent prompts as inputs of source `prompt`
([ADR-014](014-prompts-are-settings.md)), as many as it names. A prompt
that exists in neither the project's settings nor home's is a `check`
problem of the process (rule 4).

Some guidance fits only some repositories: rules for writing Go tests
help an implementer in a Go repository and mislead one elsewhere. Home
cannot hold such a prompt, or every repository gets it. A repository
cannot supply it either: a global process that names it is then broken in
every repository that does not, so each Go repository copies the process,
which ADR-014 set out to end.

## Decision drivers

- A global process offers guidance that only the repositories it fits
  supply.
- A repository without it runs the process as today.
- What the agent was given, and what it was not, is on the call's record.
- A prompt that is required stays as it is.

## Decision

A prompt input may be marked optional:
`{source: prompt, name: <name>, optional: true}`. When neither layer has
the prompt, the call goes ahead without that input.

## Rules

### 1. Absence only

`optional` takes only `true`; leaving it out means required. It covers a
prompt that exists in neither layer and nothing else: an optional prompt
that exists but cannot be read is a broken document, as any other.

### 2. A missing optional prompt drops its input

The input is not given to the agent: no section and no empty text. A
present optional prompt is given, resolved and recorded exactly as a
required one (ADR-014 rule 3).

### 3. The record says it was absent

The call's record lists each optional prompt that was not found, by
input and name, so a run shows what its agent was not given.

### 4. `check` shows it, and does not report it

A missing optional prompt is not a problem. `check --tree` and
`process show` show the input as optional and whether its prompt was
found.

### 5. Nothing refers to an optional prompt

No other input refers to an optional prompt's value; doing so is a
`check` problem of the process. An input never depends on one that may
be missing.

## Consequences

- The global `implement` can name guidance prompts, such as Go testing
  rules, that Go repositories supply in `.agister/prompts/` and others
  never see.
- A process's instruction must read right with or without an optional
  prompt; that is for whoever writes the process.
- Each repository still keeps its own copy of the guidance it supplies;
  shared guidance across repositories is a separate question (skills).

## Alternatives considered

- **An empty prompt in home, which a repository replaces.** Rejected:
  every repository gets an empty section, and home holds a stand-in
  document per guidance slot.
- **A repository adds inputs to a global process.** Rejected: it changes
  the process from outside it, which no settings layer does.

## Explicit non-decisions

Optional inputs of other sources; a default text for a missing prompt;
how guidance is shared across repositories.
