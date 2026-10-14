# ADR-022: A call may work in the caller's worktree

- **Status:** Accepted
- **Superseded by:** [ADR-025](025-a-call-works-where-it-is-called.md)
- **Date:** 2026-10-06
- **Scope:** calls whose process checks out a revision, and where they
  work and verify
- **Decision type:** Architecture
- **Amends:** [ADR-001](001-agister-cli-architecture.md) rules 11 and 12;
  [ADR-002](002-verify-and-bounded-repair.md) rule 2;
  [ADR-005](005-verify-on-a-clean-copy.md) rule 1;
  [ADR-010](010-a-process-names-its-verification.md) rule 1;
  [ADR-012](012-a-checkout-runs-its-setup.md) rule 3;
  [ADR-013](013-a-continuation-carries-the-earlier-runs-changes.md)
  rules 1 to 4

## Context

A call whose process declares `workspace.checkout` works in a fresh git
worktree of the revision. Agister releases it when the call ends
(ADR-001 rule 11), keeps the changes as `changes.patch`, and verifies on
another clean copy (ADR-005). That is the right default when the
caller's tree is shared or dirty.

Some callers already work in a worktree of their own, made for one task
and prepared for it. Ignored files in the worktree bind it to local
resources, such as a device, a proxy port or a build cache. A fresh
checkout, made only of tracked files, loses all of that:

- the agent has none of the worktree's bindings, so it cannot reach the
  resources the task needs, or reaches them only through what the caller
  tells it;
- it builds from cold, beside a warm cache that goes unused, and its
  output takes disk that nothing tracks;
- the release removes evidence the agent produced, such as test results
  its report cites;
- the caller must apply the patch to the worktree it already had;
- the clean verification copy builds from cold again, and has no binding
  for a check that needs one.

## Decision

### 1. A call works in-place only when asked

A call's workspace mode is `temporary` (a checkout of its own, as now)
or `in-place` (the caller's worktree). The mode applies only to a process
that declares `workspace.checkout`. A process without one already works
in the repository, and an explicit mode for it refuses the call.

- **Per call:** `--workspace in-place|temporary`.
- **Per repository:** `mode: in-place|temporary` in `workspace.yaml`
  (ADR-012 rule 2). The default is `temporary`.

The call's flag overrides the setting in both directions. The workspace
settings are read and checked for every process with a checkout, even
one with its own `setup`, because `mode` applies to it too.

A workflow's nodes never work in-place. A workflow call with an explicit
mode, or a node whose repository's setting is `in-place`, is refused
before any node starts.

### 2. The run records the borrowed worktree apart from its effects

The run records an in-place workspace: the worktree's directory and
identity, the repository, the revision, and the verification mode
(rule 6). This record is not an effect: no release or reap reads it, and
nothing of Agister's removes the worktree or anything in it, ignored
files included. Records made before this ADR read as before.

### 3. One call per worktree, refused, not queued

An in-place call holds a lock for the worktree, keyed by its canonical
path, for the whole call, until its process has ended and its changes
are captured. The lock is separate from ADR-008's lock and in its own
namespace under the state directory. A call that finds the lock held is
refused.

The lock ends with the CLI that holds it. A runtime process, or a
verification command, that a killed CLI left behind can still write. A
reap (ADR-001 invariant 11) can finish such a run without ending its
process, because a reap step may fail. And Agister removes the
directories it made: a checkout, a clean copy, and with each the
directory made to hold it.

So, under the lock, a call is also refused while the worktree overlaps a
directory that another run has on record, and that the run may still
write in or Agister may still remove. The run may be of any kind:
in-place, temporary, or one without a checkout, which works in the
repository itself. A directory overlaps the worktree when it is the
worktree, lies inside it or contains it, by their canonical paths.

Agister may still remove:

- the checkout of a run that has not finished;
- a clean copy, or a checkout that could not be released, that a run
  still has on record;
- the cleanup parent of any of these: the directory Agister made to hold
  it, which is removed with it and with everything else in it.

A worktree that overlaps one of these is refused first, and no process is
ended for it.

A run may still write in the directories it worked in, which are its
workspace, the worktree it borrowed, its checkout and its clean copy, but
not their cleanup parents, when:

- the run is unfinished; or
- a process the run recorded is not known to have ended. The call asks,
  through the same seam the reap uses, to end any such process. A process
  that cannot be ended, or cannot be told apart from another, refuses the
  call.

The run's record says whether its processes are known to have ended, so
a call does not have to ask again about runs that ended normally. A
record made before this ADR does not say. Its processes are taken as
ended when its call finished the run, and as not known when the run is
unfinished or a reap finished it.

Calls with different `--home` values do not coordinate (as in ADR-008).

### 4. A fresh call starts from the revision exactly

Before any turn, under the lock, a fresh in-place call is refused unless:

- HEAD is the revision;
- the worktree's content is the revision's. This is measured as the
  content identity of tracked and unignored files, as for a patch, so a
  change that status hides (`assume-unchanged`) still counts;
- the index holds no change;
- no submodule is dirty.

Ignored files are allowed. They are outside the patch and outside any
claim the run makes.

### 5. A precheck may gate the call; the setup does not run

`workspace.yaml` may declare `precheck`, with a command and a required
timeout. The command runs under the lock, after the checks of rule 4,
with the operator's authority. Its command, digest, exit status or
timeout, and bounded output are recorded, and its process group is ended
with it. A non-zero exit, a timeout, or a change it makes to the content
or HEAD refuses the call before any turn. Rule 4 is checked again after
it.

`setup` (ADR-012) does not run in-place. The caller prepared the
worktree, and the run records that it skipped the setup. `check`
validates `precheck`'s fields; it never runs the command.

### 6. Verification may run in the worktree, when its document says so

A verification (ADR-002) runs on a clean copy (ADR-005), unless its
definition declares `where: workspace`. Then an in-place call runs the
command in the caller's worktree, with its build output and bindings.
A call in a checkout of its own still verifies on a clean copy.

ADR-002 rule 7 holds in the worktree: a run that changes the content
fails, and the captured patch must rebuild the content that passed. The
run records which mode verified it.

A pass in the worktree proves the worktree, ignored state included, not
that the patch alone reproduces it. That is what an in-place call
delivers: its changes stay in the worktree, and nobody applies the
patch. A check that must prove the patch alone runs elsewhere, such as
in CI.

### 7. The call ends with its changes in the worktree

The call ends in this order:

- HEAD is checked: a commit the agent made fails the call;
- `changes.patch` is captured from the revision, and the run records the
  content identity it was taken from;
- a capture that fails leaves the call without a provenance claim, as
  ADR-002 rule 7 says for a verified call.

Whatever the end (completed, failed, timed out or interrupted), the
worktree and its git state are kept as they are: nothing is reset,
cleaned or removed. The changes stay in the worktree, uncommitted, except
where the agent committed them; that call failed, and its commit stays.

### 8. A continuation in-place resumes in the same worktree

A continued in-place call keeps ADR-013's choice of the session's latest
run and its refusals. In place of carrying the patch (ADR-013 rules 1
and 3), it is refused unless:

- the latest run worked in-place in the same worktree, repository and
  revision;
- its `changes.patch` still matches the digest it recorded, or it
  recorded `NO_CHANGES`; a run whose capture failed cannot be continued
  in-place;
- the worktree's content identity is the one that run recorded.

Nothing is applied. A runtime that resumes only where it ran (`whereItRan`)
may continue an in-place run in the same worktree. A session does not
switch between `temporary` and `in-place`. The notice of ADR-013 rule 4
says that the changes are already in this worktree.

### 9. In-place is cooperation, not confinement

Agister checks the worktree before and after the call. It does not
confine the agent to it: the agent's permissions may still let it write
ignored files, `.git`, symlink targets or other worktrees, and the patch
holds none of those. The caller must not change the worktree while the
call runs.

The coordination of rule 3 is one-sided. An in-place call checks for
every other run. A call of a process without a checkout, which works in
the repository itself, takes no worktree lock and does not check for an
in-place call already running there: Agister starts it in a worktree an
in-place call holds. Not starting one there is the caller's part.

## Amendments to earlier ADRs

- ADR-001 rule 11: a borrowed worktree is not an effect of the call; the
  call owns only its lock, its runtime process and its record.
- ADR-001 rule 12: a call may read the records of other runs of any
  kind, finished or not, to find whether one has on record a directory
  that overlaps the worktree, and that the run may still write in or
  Agister may still remove. It may end a process such a run recorded
  (rule 3).
- ADR-002 rule 2: a call may verify in the caller's worktree that it
  holds under rule 3, when the verification declares `where: workspace`.
- ADR-005 rule 1: except as rule 6 says.
- ADR-010 rule 1: a verification document may also hold `where`, whose
  only value is `workspace` (rule 6).
- ADR-012 rule 3: no setup runs in-place.
- ADR-013 rules 1 to 4: an in-place continuation checks the worktree and
  applies nothing (rule 8).

## Consequences

- A prepared worktree keeps its build cache, bindings and test results,
  and the caller does not apply a patch.
- In-place verification is weaker than a clean copy. A repository opts
  into it per verification document.
- A failed or interrupted in-place call leaves its changes in the
  worktree, for the caller to keep or discard.
- In-place calls on one worktree run one at a time, and never inside a
  workflow.

## Alternatives considered

- **A clean copy that reuses the worktree's build cache.** It would keep
  the source separate, but a cache the agent produced brings back the
  ignored state ADR-005 excludes, less visibly. It would still have no
  simulator or proxy binding. Rejected.
- **Queueing a second in-place call.** The first call leaves the tree
  changed, so the second would only be refused by rule 4 later.
  Rejected.
- **In-place nodes in workflows.** Concurrent read-only reviewers would
  need shared leases, and the mode would have to pass to child runs. No
  need has been observed yet. Deferred.
