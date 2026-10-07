# ADR-025: A call works where it is called

- **Status:** Proposed
- **Date:** 2026-10-07
- **Scope:** where every call works and verifies, and who makes the
  worktree it works in
- **Decision type:** Architecture
- **Supersedes:** [ADR-005](005-verify-on-a-clean-copy.md),
  [ADR-008](008-worktree-changes-take-turns.md),
  [ADR-012](012-a-checkout-runs-its-setup.md),
  [ADR-013](013-a-continuation-carries-the-earlier-runs-changes.md),
  [ADR-022](022-a-call-may-work-in-the-callers-worktree.md)
- **Amends:** [ADR-001](001-agister-cli-architecture.md) rules 6, 11 and
  12, invariant 11;
  [ADR-002](002-verify-and-bounded-repair.md) rules 2, 3, 4, 7 and 9;
  [ADR-010](010-a-process-names-its-verification.md) rule 2;
  [ADR-024](024-a-stale-call-is-resumed-once.md): where a resumed turn
  works

## Context

Agister is an orchestrator, grown in small, isolated steps rather than
as a full orchestrated build at once. Each step orchestrates one thing
well: a call, its verification and repair, a fan-out and join. A step
it has not taken is left to whoever calls it, a human, an agent, or a
wider orchestration.

Agister works as its caller's hands, in the caller's place. The caller
owns a task and a worktree made for it, and what it hands to Agister
(implement, review, verify) are steps of that task. They belong where
the task's work lives: the same files and the same prepared environment,
such as a simulator binding, a proxy or a warm build cache.

Making and preparing worktrees is one such untaken step. Worktrees are
the right practice for orchestration, and Agister's callers already make
them, a fresh one per change or a prepared one per ticket. Agister grew a
second workspace beside the caller's instead: a process with
`workspace.checkout` gets a fresh git worktree of the revision (ADR-001
rule 11), prepared by a setup command (ADR-012), its changes delivered as
a patch that the caller applies, verification on another clean copy
(ADR-005), continuations that carry the patch into a new checkout
(ADR-013), a lock on git's worktree commands (ADR-008), and a reap for
what a killed call leaves.

The two workspaces do not meet well:

- a checkout is a worse copy of the caller's environment: no bindings, a
  cold build, a setup script to link in what the caller already has;
- the caller applies a patch to the worktree it already had;
- ADR-022 let a call borrow the caller's worktree as an exception to
  keep apart: one call per worktree, never inside a workflow. A
  repository that set `mode: in-place` for its implementer had every
  workflow refused, its code review included. A review of the caller's
  change is one of the caller's steps; refusing it, or moving it into a
  copy, defeats the setting's point.

This is a decision about scope, not about measured use: Agister is new
and changing, and its run history does not settle it.

## Decision

Agister makes no worktree, checkout or copy: managing worktrees is not a
step it takes now. A call works in the caller's worktree. Keeping work
apart is the caller's: it makes a worktree and calls Agister there.

## Rules

### 1. A call works in the caller's worktree

A call's directory is the root of the git worktree that holds the
caller's working directory, or the one the caller names with `--dir`.
Every call works there, with or without a revision, in or outside a
workflow. A directory that is not in a git worktree refuses a call whose
process names a revision (rule 2) or declares `verify`.

`workspace.checkout`, `workspace.setup`, the `workspace` settings
document and `--workspace` are removed. Agister runs no setup or teardown
command: the caller prepares its worktree.

### 2. A process may pin the revision

`workspace.revision` names an input that resolves to a revision, as
`workspace.checkout` did. A call is refused before any turn unless HEAD
is that revision. Agister does not move HEAD: the caller checks out what
it wants worked on.

### 3. A process says whether it needs a clean worktree

`workspace.clean: true` refuses a fresh call before any turn unless the
worktree's content is HEAD's, measured as ADR-022 rule 4 did: the
content identity of tracked and unignored files, an index without
changes, no dirty submodule. Ignored files are allowed. The default is
`false`. A continuation is not checked against HEAD: its worktree holds
the earlier run's changes, and rule 7 checks it against the content
that run recorded.

A process that writes, such as an implementer, declares it, so it fails
fast instead of mixing its work with the caller's. A read-only process,
such as a reviewer, does not need it.

A process that declares `verify` must pin the revision and declare
`clean: true`: verification proves the run's changes from a known
content (ADR-002 rule 7).

### 4. Readers share the worktree; a writer has it alone

A call is a writer when its plan grants a permission the service lists
as `writing`, or when its process declares `verify`: the verification
command runs with the operator's authority, not the plan's (ADR-002 rule
10), and may change the worktree. Otherwise it is a reader. For the whole call, until its
processes have ended and its changes are captured, a writer holds the
worktree alone, and readers hold it together. A call that cannot take
its hold is refused, not queued. The hold is keyed by the worktree's
canonical path, under the state directory, and ends with the CLI that
holds it.

A run that a killed CLI left behind may still write in its worktree.
Under its hold, a call is also refused while another run that may still
write there has it on record: a writer's run that is unfinished, or whose
processes, its verification commands included, are not known to have
ended. The call asks, as the reap does,
to end such a process (ADR-022 rule 3), and is refused if it cannot.

While the reap still removes what runs made before this ADR left on
record (rule 9), a call is also refused, first, while its worktree
overlaps such a directory: a checkout, a clean copy, or the cleanup
parent made to hold one, as ADR-022 rule 3 says. A directory overlaps
the worktree when it is the worktree, lies inside it or contains it, by
their canonical paths.

A workflow's nodes are calls like any other: its readers run together in
the caller's worktree. A workflow with a writing node takes no special
rule; the node takes its hold when it starts.

### 5. Verification runs in the worktree

A process's verification command runs in the call's worktree, with its
build output and bindings. ADR-002 rule 7 holds there: a run that
changes the content fails, and a pass counts only on the content
captured. A pass proves the worktree, ignored state included. A check
that must prove the changes alone runs elsewhere, such as in CI.

### 6. The changes are evidence, and stay in the worktree

A call that pinned its revision captures `changes.patch` from it at the
end, with the content identity it was taken from, as evidence of what
the run changed. Nobody applies it: the changes are already in the
worktree. A commit the agent made fails the call; its commit stays.

Whatever the end, Agister resets, cleans or removes nothing in the
worktree. A failed or interrupted call leaves its changes for the caller
to keep or discard.

### 7. A continuation resumes in the same worktree

A continuation keeps ADR-013's choice of the session's latest run and its
refusals, and applies nothing. It is refused unless the latest run
worked in the same worktree, repository and revision, and the
worktree's content identity is the one that run recorded at its end (a
latest run without a pinned revision recorded none, and is continued
without this check). A runtime that resumes only where it ran may
resume it. The prompt says which run it continues and that its changes
are in this worktree.

### 8. Cooperation, not confinement

Agister checks the worktree before and after a call. It does not
confine the agent to it: the agent's permissions may still let it write
ignored files, `.git` or other directories, and the patch holds none of
those. The caller must not change the worktree while a writer works in
it.

### 9. Records made before this ADR read as before

A run that worked in a checkout or a clean copy keeps its record, and
the reap still removes what such a run left on record. No new run makes
one.

## Superseded and amended

- ADR-005, ADR-008, ADR-012: superseded; nothing replaces them.
- ADR-013: superseded by rule 7.
- ADR-022: superseded by rules 1 to 8. Its precheck, mode, setup skip
  and one-call-per-worktree lock go; its clean-start measure (rule 4),
  its end of a call (rule 7) and its continuation checks (rule 8) live on
  in this ADR's rules 3, 6 and 7.
- ADR-001 rule 6: artifacts are captured from the call's worktree;
  nothing is released after. Rule 11 and invariant 11: a call's effects
  are its hold, its processes and its record; the caller's worktree is
  not one. Rule 12: a call reads other runs' records to take its hold
  (rule 4).
- ADR-002 rule 2: verification needs a pinned revision and a clean
  start (rule 3), not a checkout the call owns. Rules 3, 4, 7 and 9:
  "the checkout" is the call's worktree.
- ADR-010 rule 2: "the pinned checkout" is the pinned revision and the
  clean start.
- ADR-024: a resumed turn works in the same worktree, as a repair does.

## Consequences

- One workspace model. Workflows run where they are called, reviews
  included.
- No checkout, setup, clean copy, patch application, worktree lock or
  checkout reap: a large part of Agister's code and settings goes.
- A caller that wants work kept apart makes the worktree, as Agister's
  callers already do. Should managing worktrees become one of Agister's
  steps, it is a step of its own, around calls, not inside one. Two
  writers at once need two worktrees.
- A writer refuses a dirty worktree, so a caller commits or stashes
  before it calls one.
- Verification proves the worktree, not the patch alone.
- A failed call leaves its changes in the caller's worktree.
- ai-labs' own workflow changes: an `implement` run's changes are in the
  worktree it was called in, and no patch is applied (agister
  `AGENTS.md`, the caller skill).

## Alternatives considered

- **Keep checkouts; nodes of a workflow always work in one.** Rejected:
  it keeps two workspace models and their meeting points, and moves a
  review of the caller's work into a copy of it.
- **The mode belongs to the process, not the repository.** Rejected: it
  still treats the caller's worktree as one option among two, when it is
  the place the work belongs.
- **Agister makes the worktree only when asked.** Rejected: the caller
  makes it and calls Agister there (`--dir`), so Agister needs none of
  the machinery.
- **A setup or teardown command for the caller's worktree.** Rejected:
  preparing the worktree is the caller's.

## Explicit non-decisions

Whether a writer may work in a repository's main checkout; a precheck
that gates a call on the worktree's bindings; when the reap of old
checkouts can go; the order in which the code is removed.
