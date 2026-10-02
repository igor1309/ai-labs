# ADR-010: A process names its verification

- **Status:** Accepted
- **Date:** 2026-10-02
- **Scope:** where a process's verification command is declared
- **Decision type:** Architecture
- **Amends:** [ADR-002](002-verify-and-bounded-repair.md) rule 1: where
  `verify` is declared. What verification does is unchanged.

## Context

The verification command is the repository's: its formatter, its tests. The
process that uses it is not: `implement` is the same in every repository.
ADR-002 put `verify` inside the process, and a project's settings replace
global ones a whole document at a time (ADR-001 rule 1). So a repository
that wants its own check copies the whole process. ai-labs keeps copies of
`implement`, `implement_codex`, `implement_pi` and `implement_pi_glm` that
differ from the global ones only in `verify` and one sentence of the
instruction, and the copies drift (LAB-49, observed 2026-10-02).

Prior art (researched 2026-10-02) separates the two the same way: the
reusable definition belongs to the tool or to global settings, and the
repository fills a named slot (pre-commit's hook definitions and per-repo
config, Symphony's `WORKFLOW.md`, Conductor's script slots). Tools that
merge fields instead (GitLab `extends`, Compose overrides) each carry
special rules for lists and for removing a value. A missing gate refuses
(pre-commit, Symphony); only a missing setup step is skipped.

## Decision drivers

- A repository states its verification once, for every process that uses it.
- No new layering rule: a document is still replaced whole.
- A process that expects verification never runs without it silently.
- A repository that has not declared its verification can still run
  everything else.

## Decision

Verification is a settings document of its own kind, `verifies/<name>.yaml`,
with ADR-002's four fields. A process declares `verify` either inline, as
before, or by naming such a document: `verify: verify:<name>`. The named
document is found like any other: the project's, else the global one.

## Rules

### 1. A verification document holds what ADR-002 rule 1 lists

`command`, `timeout`, `max_attempts` and `instruction`, all required, with
the same meaning and the same checks. The document has no other content
besides its schema and name. Its instruction is the failure instruction, as
before; it is not the process's instruction.

### 2. A process names at most one

`verify` is either the inline fields or one reference, never both and never
a reference with fields beside it. A process that names a verification is
held to everything ADR-002 asks of a process with `verify`: the pinned
checkout (rule 2), the resumable session for repair (rule 4), the limits
(rule 5).

### 3. The named document is resolved with the call

It is read when the call is resolved, fixed for the call and recorded among
the call's definitions with its digest, like the process and its policy.
The checks that depend on its values (attempt ceilings, timeout against the
call's, repair against the agent's session) are made on the resolved
values.

### 4. A missing document refuses the call, not the settings

A call of a process whose named verification exists in neither layer is
refused before the first turn (ADR-001 rule 7), and the refusal names the
process, the reference and both expected paths. The process is never run
unverified in its place.

`check` reports the missing document as a warning that names the process,
not as a problem: the settings still pass, and every other process and
workflow runs. A workflow with a node on such a process is refused at that
node as any refused call is.

A named document that exists but is invalid is a problem, as any invalid
document is.

### 5. Global processes name a verification and carry no command

A process meant for every repository names `verify:repo`. The repository
supplies `.agister/verifies/repo.yaml`. Global settings supply none, unless
the operator chooses a fallback for repositories that declare nothing; a
project's document replaces it.

## Consequences

- ai-labs keeps one `verifies/repo.yaml` and drops its four process copies
  once the global processes name `verify:repo`.
- A repository can keep several verifications and name them from different
  processes.
- `check` passes on settings whose process cannot run here. It says so in a
  warning; `process show` says the same.
- One more document kind for `check --tree`, `process show` and pages to
  show.
- Settings that use the reference need a binary that knows it; an older
  binary reports the scalar `verify` as invalid.

## Alternatives considered

- **Field-level override of a process.** Rejected: still one file per
  process in each repository, and it replaces the one layering rule with
  merge rules for every kind.
- **`verify` in the project's `service.toml`.** Rejected: the service
  document is replaced whole, so the repository would copy the global
  limits and vocabulary to state one command.
- **A convention script, `.agister/verify.sh`.** Rejected: timeout,
  attempts and instruction would have no place.
- **Repository values interpolated into global processes.** Rejected: a
  template language for one field.
- **A missing document is a `check` problem.** Rejected: every command
  runs `check` first, so one undeclared repository check would refuse
  reviews and every other process there.
- **A missing document means no verification.** Rejected: the process
  would complete on the agent's claim (ADR-002's first driver).

## Explicit non-decisions

Whether a caller may choose the verification by name; parameters in a
verification document; more than one command (ADR-002); how a broken
document other than this reference limits what is refused.
