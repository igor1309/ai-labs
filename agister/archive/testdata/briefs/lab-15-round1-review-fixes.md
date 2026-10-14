# LAB-15 round 1: review fixes to the clean-copy verification

Commit 5059f584 runs each verification attempt on a clean copy of the base
plus the attempt's patch. Its review found the defects below. The owner's
rules are in `agister/docs/adr/005-verify-on-a-clean-copy.md`; implement
them and fix each item, each with a regular test that fails without the
fix.

## Copy ownership (ADR-005 rule 2)

- A call has one copy, at a path fixed per call and recorded on the run
  before the copy is created, and before the patch is applied. A CLI killed
  while the copy is being made or patched leaves a copy the reap finds.
  Today `Copy` returns the directory only after `git apply`
  (`internal/adapters/git/git.go`) and `recordCopy` runs after that
  (`internal/app/verify.go`).
- Nothing overwrites a copy on record. Today attempt 1 fails, removing
  copy 1 fails and it stays on record, the repair changes content,
  attempt 2 records copy 2 over it, and copy 1 is lost. Now the next
  attempt cannot make its copy while one is on record, and the call fails.
  Test: attempt 1 exits 1 and removing its copy returns "busy"; the call
  fails and the copy is still on record.
- The reap removes a copy left on record by a finished run too, not only by
  an abandoned one (today `Abandoned` in `internal/adapters/fsruns` skips
  finished records). A live run's copy stays untouched, as now.

## The call's deadline

Copy preparation (patch capture, copy, identity) runs within the call's
deadline, and the command's timeout is what remains after it, computed
just before the command runs. Case: a 60-second call whose turn ends at
second 59 and whose copy takes 2 seconds must end as a timeout, not a pass.

## Tests

- Adapter test with a temporary repository and a malformed patch ("not a
  git patch\n"): the apply error is returned, and no copy directory or
  worktree registration is left.
- In `internal/adapters/git/git_test.go`, register the copy's cleanup with
  `t.Cleanup` right after `Copy` succeeds; keep the explicit removal
  assertions.

Replace the mentions of ADR-002 where verify runs, in comments and docs,
with ADR-005. Do not change ADR files.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
