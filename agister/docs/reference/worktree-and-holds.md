# The worktree and holds

[Reference](README.md) · [Agister](../../README.md)

## The caller's worktree

Every call works in the caller's worktree
([ADR-025](../adr/025-a-call-works-where-it-is-called.md)): the root of
the git worktree that holds the directory `agister run` is launched from,
or the one `--dir` names, with that worktree's settings. A workflow's
nodes work there too. Agister makes no checkout or copy, runs no setup
and does not move HEAD: the caller prepares the worktree, and makes one
to keep work apart. A process says what it needs of the worktree:

```yaml
workspace:
  revision: candidate_revision  # the input HEAD must be at
  clean: true                   # a fresh call starts from HEAD's content
```

`revision` names an input that resolves to a revision; a call is refused
before any turn unless HEAD is that revision. `clean: true` refuses a
fresh call unless the worktree's content is HEAD's: a staged change, a
dirty submodule, an untracked file git does not ignore, or a changed
tracked file, even one marked `assume-unchanged`, refuses it. Ignored
files are allowed. Unset, `clean` is `false`. A process that writes, such
as an implementer, declares it; a reviewer does not need it. A process
with a verification must declare both. A call of a process that pins a
revision, needs a clean worktree or has a verification is refused outside
a git worktree.

`workspace.checkout` is now `workspace.revision`, and `check` reports it
as a problem. `workspace.setup`, a verification's `where` and the
`workspace.yaml` document, with its `mode`, `precheck` and `setup`, are
obsolete and ignored, and `check` warns about each. `--workspace` is gone.

## Holds

A call is a writer when its plan grants a permission the service lists as
`writing`, or its process has a verification, whose command runs with your
authority; otherwise it is a reader. Readers share the worktree, so a
workflow's reviews run together; a writer holds it alone, for the whole
call. A call that cannot take its hold is refused, not queued. It is also
refused before any turn if:

- the worktree overlaps a directory a writer's run worked in and may
  still write in, because its owner still runs it or it left a process
  that cannot be ended. Agister ends the ones it can: a run its owner was
  killed in is finished as lost, with its processes ended, by the call
  that meets it, which is then admitted. A process reading that run's
  state does not stop this; one exporting it (`agister runs export`) does
  until the export is done;
- the worktree overlaps a directory that a run made before ADR-025 left on
  record and Agister may still remove: a checkout, a clean copy, or the
  directory made to hold one.

A writer's directory overlaps the worktree when it is the worktree or
contains it, by their canonical paths. One inside it overlaps when its
canonical git root is the worktree, or is within a submodule tracked in
the worktree's index: a gitlink entry, mode `160000`, including a staged
one. `.gitmodules` alone does not make it overlap. A writer in a separate
nested git worktree does not block an outer call; an outer writer still
blocks a nested call, since its permissions cover subfolders. If the git
boundary cannot be read or the submodule check fails, the path overlap stays
([ADR-037](../adr/037-a-nested-worktree-writer-does-not-block-the-outer.md)).

Directories Agister may still remove overlap by canonical path alone:
one that is the worktree, lies inside it or contains it overlaps,
whatever git roots lie under it. Calls with different `--home` values do
not share the hold.

## Verification and changes

A verification runs in the worktree, with its build output and ignored
files. A run that changes the content fails, and the captured patch must
rebuild the content that passed. A pass proves the worktree, not the
changes alone: a check that must prove them alone runs elsewhere, such as
in CI.

A call leaves its changes in the worktree, uncommitted, however it ends:
nothing is reset, cleaned or removed. A call whose process pins a revision
captures them at the end as
`~/.agister/runs/<id>/artifacts/changes.patch`, from the revision, with
the content it was taken from (`in_place.content`). The patch is evidence:
nobody applies it, for the changes are already there. A call that changed
nothing records `NO_CHANGES` and has no patch. When the process pins a
revision, an agent that commits in the worktree fails the call, and its
commit stays; without a pinned revision, a commit is not detected.
Agister checks the
worktree before and after the call but does not confine the agent to it;
do not change the worktree while a writer works in it.

## Continuation

`--continue <run-id>` resumes the session in the same worktree, after the
session's latest run, whichever run of the session you name. Only a
workflow of one `call` whose process is `resumable` takes it, on a runtime
that resumes, and only for a run of a workflow call of the same process
on the same agent: a fan-out workflow cannot be continued, and neither can
a run made before ADR-030, though its record stays readable. It applies
nothing: that run's changes are in the worktree. Launch from it and pin
the same revision: a default like `HEAD` resolves in the directory you
launch from. The call is refused unless the latest run worked in the same
worktree, repository and revision, HEAD is at the revision, the
worktree's content is the one that run recorded, and its `changes.patch`
is as recorded. A latest run whose capture failed, or that worked in a
checkout before ADR-025, cannot be continued; one that pinned no revision
is continued without the content check. The agent is told where it works
and that the session's changes are already there, uncommitted; it is told
no run ([ADR-035](../adr/035-a-continuation-notice-names-no-run.md)).
