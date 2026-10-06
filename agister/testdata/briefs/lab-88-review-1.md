# Review fixes for the in-place workspace (LAB-88, review round 1)

The code_review workflow run 20261006T132134Z-1984da ruled these items to fix. Do each as its action says, with the committed test it names. Change nothing else.

## 1. Make the borrowed run reapable before starting a process

**Action.** Initialize an empty Effects record before the Update at agister/internal/app/inplace.go:164, without recording the borrowed worktree as a checkout. Add a committed test using a temporary run store: abandon at this point, reap, and verify that another call can borrow the worktree.

**Why.** There is a concrete sequence: SIGKILL right after the borrowed-worktree record is saved. The trace runs from that save (Effects is nil, FinishedAt is unset) through Abandoned and Reap, which both skip records with nil Effects, to the next borrower, which refuses the unfinished record. That is the causal chain to a persistent refusal, which breaks ADR-001 invariant 11 and ADR-022 rule 3. The change introduced it. Major is supported: the new mode stays unavailable after an interruption the project supports.

## 2. Preserve patch whitespace during rebuilding

**Action.** Add --whitespace=nowarn to Rebuild at agister/internal/adapters/git/git.go:575. Add a committed adapter test with apply.whitespace=fix configured and a patch that adds trailing whitespace.

**Why.** There is a concrete configuration: apply.whitespace=fix, plus an added line with trailing whitespace. The trace runs from the verified identity through Rebuild calling git apply --cached without an override, to the tree mismatch and a ClassInternal capture that records no content identity. The sibling Apply at git.go:425 already uses --whitespace=nowarn. The change introduced it. Major is supported: valid, paid calls fail and continuation is lost.

## 3. Prove that a panic leaves ProcessesEnded false

**Action.** Add an in-place test whose runner records its process and then panics, and assert that the final record has ProcessesEnded=false. Use the existing runner acting hook.

**Why.** The trace shows that clearing `ended` at calls.go:803 is the only thing that sets ProcessesEnded=false on the panic path, that the existing panic test never asserts ProcessesEnded, and that inplace.go:216 skips the writer check when ProcessesEnded is true. The fix is a normal test that uses an existing seam, as AGENTS.md requires. Major is supported: an unguarded regression would let a later borrower skip reaping a live writer.

## 4. Assert that the precheck process is persisted while running

**Action.** Extend TestAPassingPrecheckIsRecorded: in the existing running hook, inspect the saved updates and require Effects.Command.Ref to equal ref-cmd before the command proceeds.

**Why.** The trace shows that the precheck callback at setup.go:197 persists Effects.Command through recordGroup. The spy accepts a no-op callback. The test claims the process group is recorded but asserts only outcomes and events. The writer checks at inplace.go:216/223 need that reference. The change introduced both the test and the claim. Major is supported: losing the reference would defeat writer exclusion after an interrupted precheck.

## 5. Register lock releases before assertions can terminate the test

**Action.** Register every successful acquisition with t.Cleanup immediately, including an unexpected successful second acquisition.

**Why.** There is a concrete failure path: a wrong returned key makes the assertion at locks_test.go:38 fail after the lock is acquired at :36, so the explicit release at :50 never runs. That breaks review item 10 (clean up on every path). The change introduced the test. Minor is supported: a descriptor leaks, but no later test failure is shown.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

List every file you changed.
