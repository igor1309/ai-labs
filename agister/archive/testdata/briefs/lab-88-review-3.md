# Review fixes for the in-place workspace (LAB-88, review round 3)

The code_review workflow run 20261006T135135Z-663668 ruled these items to fix. Do each as its action says, with the committed test it names. Change nothing else.

Items 1 and 2 are the third and fourth admission cases the reviews found in `Borrower` (inplace.go). Rounds 1 and 2 added cases one at a time. Close the class instead, with one rule and one place that applies it:

- a borrow is refused while any recorded run (in-place, temporary or checkout-less; finished or not) has a directory that **overlaps** the canonical worktree, where overlap means equal to it, inside it, or containing it, AND either:
  - that run may still write there (it is unfinished, or its runtime or command process is not known to have ended); or
  - Agister may still remove that directory (an unfinished run's checkout, a copy or an unreleased checkout on record).

Compare canonical paths only (the `Key` from the locks adapter), never raw strings. Keep the existing per-case tests passing; add the nested-directory and checkout-less cases the items name.

## 1. Borrowed repository nested in another run's cleanup directory is deleted

**Action.** Reject borrowed paths that lie within another run's canonical cleanup directory, nested repositories included, by extending Borrower.made in inplace.go. Add a committed admission test with a nested-directory case in inplace_test.go using t.TempDir().

**Why.** The evidence holds and the severity is supported. The reviewer gives a concrete sequence (temporary run A with checkout D, clean ignored repository N at D/tool, in-place run B launched from N) and traces it line by line: the equality-only ownership guard at inplace.go:259 skips A, B is admitted, and A's release at git.go:362 recursively removes D's parent, taking N and B's uncaptured changes. That is a direct chain from the case through ADR-022 rules 2 and 7 to data loss. In-place admission is new in this change. The finding asks to extend a guard and shows the case that needs it.

## 2. Admission skips a recorded repository-scoped writer from a checkout-less run

**Action.** Extend Borrower.writers so that for records without InPlace it compares the canonical Workspace path and enforces the same unfinished/process checks. Add a committed regression test in inplace_test.go for a checkout-less run whose reap left its writer alive.

**Why.** The evidence holds and the severity is supported. The case is a concrete sequence: checkout-less read-write run A in W, its CLI killed, a failed reap persisting ProcessesEnded=false, then in-place run B in the same W. The trace runs from policy.go:158 and :184 through calls.go:896 and reap.go:205 and :255 to inplace.go:276, where A is skipped only because A.InPlace is nil. B is admitted while A's recorded runtime can still write W. ADR-022 rule 3 as quoted covers any run that records the same worktree. The admission scan is new in this change.

## 3. Writer-exclusion tests never exercise a command writer

**Action.** Add command-only cases to the fixture and table in inplace_test.go, using the existing process spy: refusal for ReapLeft or an error, and admission after ReapKilled or ReapGone.

**Why.** The evidence holds. The reviewer traces that every writer-exclusion fixture populates Effects.Process only (inplace_test.go:419, :439, :454), that inplace.go:288 is the borrower's only inspection of Effects.Command, and that the one command-reaping assertion (reap_test.go:181) exercises Reaper, not Borrower. So a lost command check admits a call beside a live verification command with every test green. Major is supported: the unproven behaviour is the writer exclusion ADR-022 rule 3 requires. The fix asked for is ordinary committed test cases.

## 4. Rebuild proof ignores the revision being rebuilt

**Action.** Make the positive rebuild fixture in inplace_verify_test.go distinguish the expected revision from an incorrect one, and have the rebuilding stub and its callers provide and check the expected revision.

**Why.** The evidence holds. The trace shows the rebuild stub returns the current content for any revision (inplace_verify_test.go:31, :297), the spy records only directory and patch (spies_test.go:309), and the success assertion checks only those (inplace_verify_test.go:92). The real adapter passes the revision to git read-tree (git.go:570), and the real-git fixture verifies on a copy, so it never reaches this call. A wrong revision at calls.go:1673 would therefore break every passing workspace-verified call while the tests stay green. Major is supported by that chain to ADR-022 rule 6.

## 5. No in-place test exercises the production borrower wiring

**Action.** Add a command-package test that makes an in-place call through the existing CLI/composition helpers (setup, fake-runtime, fake-git) and asserts successful execution plus the saved in-place record.

**Why.** The evidence holds. The trace shows the new command-package tests build their own Borrower and Calls (verify_loop_test.go:431-432) and bypass composition.wire and NewClient. NewClient accepts missing collaborators (gate.go:112), and the only composed setup fixture has no in-place mode (wiring_test.go:660). Losing the initializer at main.go:310 would therefore make every production in-place call fail internally with all tests green. Major is supported: the uncovered behaviour is the whole CLI feature.

## 6. Deploy warm-up runs with no hang bound before the suite timeout starts

**Action.** Give the warm-up in runWithShim a CommandContext hang guard of at most one minute and report expiry as a harness failure.

**Why.** The evidence holds as a rule violation. The trace shows the warm-up at deploy_test.go:61 is a synchronous exec.Command.Run with no context or deadline, reached before m.Run, while the existing ten-second guard at :212 covers only box.run. Review item 8 as quoted requires every hang bound to be at most one minute, and this launch has none. The reviewer does not show what would make the child hang, so the consequence stays conditional; minor is the right level and is what the reviewer claimed. The presented cost does not exceed the benefit, so the minor presumption to fix stands.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

List every file you changed.
