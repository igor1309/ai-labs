# ADR-013: Prompts are settings

- **Status:** Accepted
- **Date:** 2026-10-02
- **Scope:** where a process's fixed text inputs, such as a review prompt,
  are kept and how they are found
- **Decision type:** Architecture
- **Amends:** [ADR-001](001-agister-cli-architecture.md) rule 2: the
  definitions that are settings gain prompts

## Context

A process gives its agent text from files: a brief the caller names, and
prompts the settings fix, such as a reviewer's instructions. Both are
`source: file` inputs, and a relative path is read from the caller's
directory. A prompt that global settings name is therefore found only in a
repository that has it at that path; global settings name it by an
absolute path into Agister's home instead, which no other machine has.

A repository that wants its own prompt has to copy every process that uses
it, changing only the path. ai-labs keeps seven such copies of the review
and advisor processes, and two of the prompts they point at already differ
from the global ones.

[ADR-010](010-a-process-names-its-verification.md) solved the same shape
for verification: the reusable process stays global and names a document
that each layer may supply.

## Decision drivers

- A prompt is found wherever its process runs, on any machine.
- A repository replaces one prompt without copying the processes that use
  it.
- No new layering rule: a document is still replaced whole.
- What the caller names stays relative to the caller.

## Decision

A prompt is a settings document of its own kind, `prompts/<name>.md`,
plain text with no header. A process gives one to its agent as an input of
a new source, `{source: prompt, name: <name>}`. The prompt is found like
any document: the project's, else the global one.

## Rules

### 1. A prompt document is its text

The file's contents, unchanged, are the input's value; its name is the
file's name without `.md`, under the same naming rule as every document.
It must be readable text, as every document must.

### 2. A prompt input names its document literally

`name` is a document name, not a path, and is not interpolated: it is
fixed by the settings, not the caller, so `check` can resolve it. A text
the caller chooses stays a `source: file` input.

### 3. The prompt is resolved with the call and recorded

It is read when the call is resolved, from the same settings the call
uses, fixed for the call and recorded among the call's definitions with
its digest, like the process and its policy. The input's identity is that
digest.

### 4. A missing prompt is a problem of the process

A process naming a prompt that exists in neither layer is a `check`
problem attributed to the process, as a missing policy or output schema
is. `check --tree` links the process to the prompts it names.

### 5. `source: file` keeps its meaning

A relative path is still read from the caller's directory. Settings that
name a prompt by file keep working; moving them to `source: prompt` is the
operator's choice.

## Consequences

- A global process names its prompts and runs in every repository; a
  repository with its own prompt supplies `.agister/prompts/<name>.md`.
- ai-labs can drop its seven process copies once the global ones name
  their prompts.
- `process show`, `check --tree` and pages show a process's prompts and
  which layer each comes from.
- One more document kind and one more input source; settings that use
  them need a binary that knows them.

## Alternatives considered

- **A relative path means relative to the document that names it.**
  Rejected: it silently changes what existing paths mean, and a repository
  still copies a process to change one prompt.
- **Named roots in paths (`${home}`, `${repo}`).** Rejected: portable, but
  a repository still copies a process to change one prompt.
- **A missing prompt is a warning that refuses only the call, as in
  ADR-010.** Rejected: a verification is a slot each repository is
  expected to fill; a prompt is part of the process, so a missing one is a
  settings mistake. How far a problem refuses is a separate question.

## Explicit non-decisions

Prompt formats other than `.md`; prompts that include other prompts;
parameters substituted into a prompt; whether the process instruction
itself may name a prompt.
