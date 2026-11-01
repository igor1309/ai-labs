# LAB-114 step 1: every call works in the caller's worktree

Implement the behaviour of ADR-025 (`agister/docs/adr/025-a-call-works-where-it-is-called.md`,
accepted; read it first, then ADR-022, whose in-place path this builds
on). This is step 1 of 3:

1. this step: the behaviour;
2. later: rename `workspace.checkout` to `workspace.revision`, and delete
   the code no call reaches any more (fresh checkouts, setup, clean
   copies, carried patches, the ADR-008 coordinator), keeping what the
   reap needs for old records;
3. later: the done gates (caller skill, README, settings diagrams,
   Pages, `agister/AGENTS.md`).

So in this step keep the field name `checkout`, and leave the code of
the temporary path in place where deleting it would grow the change; it
only has to be unreachable for new calls. Do not touch the docs of step 3.

## What changes

1. **Every call works in the caller's worktree.** The in-place path
   (`internal/app/inplace.go`, the `res.Process.InPlace` branch of
   `Calls.execute` in `internal/app/calls.go`) becomes the only path for
   a process with `workspace.checkout`. No new call makes a checkout, a
   setup run or a clean copy. A process without a checkout works in the
   root of the caller's git worktree, as today, and now also takes a
   hold (item 4).

2. **`--dir <path>`** on `agister run` (calls and workflows) names the
   caller's directory; the default is the working directory, as today
   (`Request.Cwd`). The call works in the root of the git worktree that
   holds it. A directory in no git worktree refuses a call whose process
   declares a checkout or `verify`. A workflow call accepts `--dir`; its
   nodes work in that directory too.

3. **Removed for new calls:** the workspace mode (`--workspace`, the
   `mode` field of `workspace.yaml`), the `precheck` and the `setup`
   (process and `workspace.yaml`), and the verification document's
   `where` (verification always runs in the worktree). Old settings must
   not break a repository: a `workspace.yaml`, a process `workspace.setup`
   and a verification `where: workspace` are read as obsolete. `check`
   reports each as a warning that names ADR-025 and says it is ignored;
   a call ignores it. (iFora's `.agister/workspace.yaml` has `mode:
   in-place`, `precheck` and `setup`; its `verifies/repo.yaml` has
   `where: workspace`.) A call that passes `--workspace` is refused by
   the CLI as an unknown flag.

4. **Readers share the worktree; a writer has it alone (ADR-025 rule 4).**
   A call is a writer when its enforcement plan grants a permission the
   service lists as `writing` (`definition.Service.Writing`), or its
   process declares `verify`; otherwise a reader. Replace the
   one-call-per-worktree lock with a shared/exclusive hold: readers hold
   it together, a writer alone; a call that cannot take its hold is
   refused, not queued. The hold is keyed by the worktree's canonical
   path under the state directory, as now, and is held until the call's
   processes have ended and its changes are captured. Record on the run
   whether it held the worktree as a writer; a record made before this
   change that has `InPlace` reads as a writer.
   Keep the leftover-run checks of ADR-022 rule 3, narrowed: a call is
   refused while a writer's run (unfinished, or whose processes,
   verification commands included, are not known to have ended) has the
   worktree on record; end such processes through the reap's seam as
   today. Keep the overlap refusal for directories the reap may still
   remove (old checkouts, clean copies, their cleanup parents) unchanged.

5. **`workspace.clean` (ADR-025 rule 3).** A process may declare
   `workspace.clean: true` (default false). A fresh call of such a
   process is refused unless the worktree's content is HEAD's, measured
   as the in-place check does today (ADR-022 rule 4: content identity,
   no index change, no dirty submodule; ignored files allowed). Without
   it, a fresh call checks only that HEAD is the revision. A
   continuation is never checked against HEAD; item 7 checks it.
   `check` reports a problem for a process that declares `verify`
   without a checkout or without `clean: true`.

6. **Verification and the end of a call (ADR-025 rules 5 and 6).**
   Verification runs in the worktree, as `where: workspace` does today,
   with ADR-002 rule 7 and the rebuild check of the captured patch. A
   call with a checkout captures `changes.patch` from the revision as
   evidence, records the content identity it was taken from, and a
   commit the agent made fails the call, as the in-place path does today.
   Nothing in the worktree is reset, cleaned or removed.

7. **Continuation (ADR-025 rule 7).** As ADR-022 rule 8 has it, without
   the temporary mode: refused unless the session's latest run worked in
   the same worktree, repository and revision, and the worktree's content
   identity is the one that run recorded at its end. A latest run without
   a checkout recorded no content identity and is checked only for the
   same worktree. A latest run that worked in a checkout of its own (made
   before this change) cannot be continued: the refusal says so and
   names ADR-025.

8. **Workflows.** Remove the refusal of a workflow whose node would work
   in-place (`internal/app/resolve.go`, `workflow`) and the refusal of a
   workflow call with a workspace mode (`internal/app/workflow.go`);
   keep refusing the other per-call options there. Read-only nodes run
   together in the caller's worktree.

9. **Settings in this repository.** In `.agister/processes/`, the
   implementer processes (`implement*.yaml`) declare `clean: true`.
   Update the comment in `.agister/verifies/repo.yaml` (it says the
   check runs on a clean checkout with the patch applied) and the
   `implement*` instructions that say "in this checkout of the
   candidate" / "Agister keeps your changes" so they say the agent works
   in the caller's worktree at the candidate, and its changes stay
   there, uncommitted. `examples/` settings likewise, if they show
   `mode`, `setup`, `precheck` or `where`.

## Done when

Regular committed tests, through the app's seams (fakes, spies,
`t.TempDir()`, the git test helpers), show:

- a fresh call of a process with a checkout works in the caller's
  worktree, not a checkout, without any workspace setting;
- `--dir` points a call at another worktree; a directory in no git
  worktree refuses a call that declares a checkout or `verify`;
- two reader calls hold one worktree at once; a writer is refused while
  a reader or a writer holds it, and a reader while a writer does; a
  call with a read-only plan and `verify` is a writer;
- a reader is refused while a writer's leftover run may still write
  there, and the old-checkout overlap refusal still holds;
- `clean: true` refuses a dirty worktree; without it a dirty worktree at
  the revision is accepted; HEAD other than the revision refuses either;
- verification runs in the worktree;
- a continuation in the same worktree with the recorded content
  resumes, one with other content is refused, and one whose latest run
  worked in an old checkout is refused naming ADR-025;
- a workflow whose readers are calls with a checkout runs, in a
  repository whose `workspace.yaml` says `mode: in-place`, and the
  nodes work in the caller's worktree; `--dir` on a workflow call is
  accepted;
- `check` warns about an obsolete `workspace.yaml`, process `setup`
  and verification `where`, and reports `verify` without `clean: true`
  as a problem.

Tests that asserted the removed behaviour (temporary checkouts for new
calls, setup, precheck, the mode, `where`, workflows refused in-place,
verification on a clean copy) are changed to the new behaviour or
removed; say which, by name, in your report.

## Constraints

- Regular committed tests only: fakes, spies, fixtures, `t.TempDir()`.
  No mutation or revert checks.
- Match the surrounding code, its comments (they cite ADR rules: cite
  ADR-025 where the rule is now ADR-025's) and its naming.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.
