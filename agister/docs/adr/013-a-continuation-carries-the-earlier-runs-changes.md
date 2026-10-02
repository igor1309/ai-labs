# ADR-013: A continuation carries the earlier run's changes

- **Status:** Accepted
- **Date:** 2026-10-02
- **Scope:** continued calls whose process checks out a revision
- **Decision type:** Architecture
- **Amends:** [ADR-001](001-agister-cli-architecture.md) rule 2: what
  the agent is told; rule 12: what a continuation reads of the earlier
  run;
  [ADR-012](012-a-checkout-runs-its-setup.md) rule 4: what a checkout
  holds before the first turn

## Context

A continuation resumes a finished run's provider session (ADR-001 rule
12). A call whose process declares `workspace.checkout` works in a fresh
checkout of its revision, released when the call ends (ADR-001 rule 11),
and keeps its changes as the run's `changes.patch`, from the revision.
A run that fails, runs out of time or hits a rate limit keeps its patch
too.

Continuing such a run today resumes the conversation in a new checkout of
the revision without those changes. The agent remembers work its files
no longer hold: it looks for its old directory, then redoes the work. A
rate-limited run, the commonest reason to continue, loses everything it
spent. The earlier checkout is gone by then, so the patch is the only
record of the work.

## Decision

### 1. A continuation brings the earlier run's patch into its checkout

When a call with a checkout continues a run that kept a `changes.patch`,
that patch is applied to the call's checkout, uncommitted, before the
first turn. The run continued is the only source: its patch is already
cumulative from the revision, so continuing a continuation needs no
earlier patch. An earlier run that kept no patch, or worked without a
checkout, carries nothing.

### 2. Only onto the same base

The patch is carried only into a checkout of the same revision in the
same repository as the earlier run's. Otherwise the call is refused: the
patch and the session's memory both describe that base. The checkout's
record names its revision. For a record made before this ADR, the
revision is the earlier run's input that its process checked out, when
the call runs the same process. Otherwise the call is refused.

### 3. The patch is checked before the setup and applied after it

The patch read must match the digest the earlier run recorded, and must
apply to the revision. Both are checked before the setup runs, so a
patch that cannot be carried costs no setup. The setup still runs on the
revision's own content (ADR-012 rule 4). The patch is applied after it.
A patch that does not match or does not apply refuses the call before any
turn. A continuation never silently starts clean.

### 4. The agent is told

The call's prompt says which run it continues, that its changes are
applied, uncommitted, in this new checkout, and that the earlier
directory is gone. These words are Agister's, not the process
definition's, because only Agister knows them.

### 5. The new patch is still from the revision

The call's own `changes.patch` stays cumulative from the revision. It
includes the carried changes, so it alone delivers everything the
session has done. Verification on a clean copy (ADR-005) is unchanged:
the copy is the revision with that patch applied.

## Amendments to earlier ADRs

- ADR-001 rule 2: besides what the process defines, a continued call's
  prompt carries Agister's own notice of the continuation (rule 4). It
  states only facts of the call: the run continued, the checkout and
  whether changes were carried.
- ADR-001 rule 12: a continuation reads the earlier run's session and,
  for a call with a checkout, its `changes.patch`.
- ADR-012 rule 4: the setup sees the revision's content. A continuation's
  carried changes are applied after it, before the first turn.

## Consequences

- A rate-limited or failed run can be continued without losing its work,
  and without the caller applying its patch by hand.
- A continuation can no longer move to another revision. Starting over on
  a new revision is a fresh call.
- If the setup depends on tracked files the carried patch changes, it ran
  on the revision's versions of them.
- A run whose patch could not be stored records no patch, so a
  continuation of it carries nothing. Its events record the failure.
