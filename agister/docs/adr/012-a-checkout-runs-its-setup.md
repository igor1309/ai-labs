# ADR-012: A checkout runs its setup before the agent starts

- **Status:** Accepted
- **Date:** 2026-10-02
- **Scope:** calls whose process checks out a revision
- **Decision type:** Architecture
- **Amends:** [ADR-001](001-agister-cli-architecture.md): what a call's
  workspace holds before its first turn;
  [ADR-006](006-a-call-gets-its-repository-instructions.md): where the
  instructions and skills it loads come from

## Context

A call whose process declares `workspace.checkout` runs in a fresh git
worktree of the revision. A worktree holds only what the repository
tracks, so it leaves out untracked configuration that a runtime needs
when it starts: for example, entries in a sibling configuration
directory that the owner links into each worktree after creating it. In
an Agister checkout that configuration is missing, so the runtime starts
without it, and ADR-006 silently does not hold.

Only the repository's owner knows how its worktrees are prepared, and the
runtime reads its instructions, skills and MCP configuration when it
starts. Preparation therefore has to run between the checkout and the
first turn; an instruction to the agent comes too late.

## Decision

### 1. A checkout may declare one setup command

`workspace.setup` belongs to the process, beside `workspace.checkout`:

- **command:** one Bash command, fixed when the call is resolved and
  recorded with the definition's digest, as a verification command is
  (ADR-002 rule 1).
- **timeout:** required. There is no default.

`setup` without `checkout` is invalid, and `check` says so: without a
checkout the agent works in the repository itself, which needs none.

### 2. A repository may give a default

A `workspace` settings document (`workspace.yaml`, schema
`agister.workspace/v1alpha1`) may declare `setup` with the same fields.
It applies to every process that declares `checkout` and no `setup` of
its own. A process's own `setup` replaces it, whole. Like every
document, a repository's `workspace.yaml` takes priority over the global
one.

### 3. It runs once, after the checkout, before the first turn

The command runs in the call's checkout, with the operator's authority,
not the agent's permissions. It runs once per call: repair turns
(ADR-002) continue in the same checkout and do not run it again.

### 4. It must not change the checkout's content

After the command, the checkout's content must still be the revision's:
nothing tracked changed and nothing unignored added. What it makes has
to be ignored, so it is never part of a patch the call delivers. A
command that changes the content fails the call.

### 5. A failed setup fails the call before the agent runs

A command that exits non-zero, runs out of time or changes the content
fails the call. No turn runs. The run records the command, its exit
status or timeout and its bounded output, and the checkout is released as
on any other failure.

### 6. The verification copy runs no setup

ADR-005's clean copy is the base plus the patch, nothing else. A check
that needs the repository's untracked configuration prepares it in its
own command, which the owner already writes.

## Amendments to earlier ADRs

- ADR-001: a call's checkout holds the revision and what its setup
  command adds, ignored.
- ADR-006: the instructions and skills a call loads include those its
  checkout's setup provides.

## Consequences

- A repository that links its agent configuration into worktrees gets it
  in Agister's checkouts with one `workspace.yaml`, for every process.
- Every call with a checkout pays for its setup command.
- Agister runs another command the repository's settings name; as with
  verification, reviewing settings is the operator's job (ADR-001).
