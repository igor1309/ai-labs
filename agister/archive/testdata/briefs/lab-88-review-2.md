# Review fixes for the in-place workspace (LAB-88, review round 2)

The code_review workflow run 20261006T133448Z-8fed58 ruled these items to fix. Do each as its action says, with the committed test it names. Change nothing else.

## 1. Background reaper deletes a worktree another run has borrowed in place

**Action.** Refuse borrowing a directory recorded as another unfinished run's checkout, or as an outstanding copy or unreleased checkout, in Borrower's ownership admission in agister/internal/app/inplace.go. Add a committed test in inplace_test.go covering an abandoned owner and an attempted borrow, using the existing run-store seams.

**Why.** The evidence holds. The reviewer gives a concrete sequence (temporary run A killed with checkout D left clean, run B launched from D with --workspace in-place) and traces it line by line: the writer scan skips A because A.InPlace is nil, LiveCheckouts excludes B because its Effects has no Checkout or Copy, and the reaper then calls Discard, which force-removes D and its parent directory. That chain reaches ADR-022 rules 2 and 7 as quoted, and loss of B's uncaptured changes supports major. The finding asks for a new admission guard, and it shows the case that needs it. One fix is presented, so there is no choice between fixes to hand to the owner.

## 2. No test produces an unmerged index, so the 'u' status-entry guard is unprotected

**Action.** In agister/internal/adapters/git/git_test.go, add a temporary repository with unmerged index entries and files restored to HEAD without staging; assert that State reports the conflicted path in Staged.

**Why.** The evidence holds. The reviewer names the fixture table's cases (clean, ignored, modified, assume-unchanged, staged, untracked), none of which is unmerged, and shows the application test supplies Staged directly, so no test reaches the adapter's unmerged-entry parsing. The trace also shows Identity uses a scratch index seeded from the revision, so the content check gives no second rejection. The harm to a caller's worktree depends on a later regression; what is shown now is a changed guard without a failing test, against review item 1 and ADR-022 rule 4. Major stands because the guard is traced as the only protection for unresolved work at admission.

## 3. Dirty-submodule test does not require the --ignore-submodules=none override

**Action.** In the existing dirty-submodule test in agister/internal/adapters/git/git_test.go, configure submodule.lib.ignore=all before editing lib/a.txt and retain the assertion that lib is dirty.

**Why.** The evidence holds. The reviewer shows the fixture creates the submodule without any ignore configuration, so its assertion proves only default dirty-submodule reporting. The concrete input that needs the override is submodule.lib.ignore=all. The trace shows the content identity records the unchanged gitlink commit, so nothing else rejects the state, and admission depends on DirtySubmodules. As with 2#1, the harm depends on a later regression; what is shown now is a changed guard no test would fail without, against review item 1 and ADR-022 rule 4. Major stands on the traced absence of a second rejection.

## 4. Borrow keeps the worktree lock when the precheck panics

**Action.** Change Borrow's deferred cleanup in agister/internal/app/inplace.go to release whenever ownership was not successfully transferred, including panic unwinding. Add a precheck-panic regression test using the existing setupCommandsSpy.running hook.

**Why.** The evidence holds. The deferred cleanup is traced as conditional on the named err, which stays nil on a panic; Calls has not yet been handed borrowed.Release; Calls then recovers the panic and finishes the run, so the lock is still held on a path the code treats as survivable. The requirement is the stated one at calls.go:725-727 that every effect is released on every path. Minor is supported and the reviewer limits it honestly: it needs a collaborator panic, and process exit releases the lock. Benefit and cost are both small and neither clearly exceeds the other, so the presumption for a minor stands.

## 5. Borrow test helper leaves run ownership open

**Action.** In the borrow helper in agister/internal/app/inplace_test.go, register Store.Abandon cleanup immediately after Create and Borrowed.Release cleanup immediately after a successful Borrow.

**Why.** The evidence holds. The trace shows store.Create opens owner.lock and takes an exclusive flock with no cleanup registered; on the success path only Borrowed.Release runs, which releases the worktree lock and not run ownership; an Update error returns before the explicit run-0 abandonment. That breaks review item 10 on both the success and failure paths. Minor is supported: the leak is concrete, test-local, and no failure of another test was established.

## 6. New verifyFields catalog is a package-level mutable table, against D-9

**Action.** In agister/internal/domain/definition/documents.go, replace the verifyFields and verifyKeys catalogs with pure functions returning fresh values and update their parser call sites.

**Why.** The evidence holds. ParseProcess and ParseVerify are both traced to the same writable package variable, and D-9 is quoted as rejecting mutable package-level tables with no exception recorded. The reviewer states that no incorrect parsing result was established, so the benefit is conformance to a recorded decision; that supports minor and no more. The introduced-by-change evidence is for verifyFields; the reviewer describes verifyKeys as retained but costs both replacements together in the one file. Presented cost is small and contained and does not exceed the benefit.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

List every file you changed.
