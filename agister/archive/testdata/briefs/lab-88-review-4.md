# Review fixes for the in-place workspace (LAB-88, review round 4)

The code_review workflow run 20261006T141428Z-0410f8 ruled items 1 to 4 to fix. Do each as its action says, with the committed test it names. Items 5 to 8 come from the round-3 implementer's notes (run 20261006T140135Z-5df960). Change nothing else.

## 1. Check the entire cleanup directory before lending a worktree

**Action.** Include the canonical cleanup parent in the removal claims for unfinished checkouts, outstanding copies and unreleased checkouts, while retaining their workspace directories for writer checks. Add a committed regression test with a clean sibling repository under that parent.

**Why.** The evidence holds. The reviewer gives a concrete layout and ordering (temporary run A owns P/workspace-X, in-place run B borrows a clean repository at P/tool, A finishes and removes P) and traces it line by line: the checkout is created inside parent P (git.go:348-352), the claim uses the checkout directory (inplace.go:278-284), the overlap test finds none between siblings (inplace.go:305-321), B is admitted (inplace.go:200-226), and A's release recursively removes P (git.go:362). The chain from the trace through ADR-022 rules 2 and 7 to data loss in an admitted call supports major. The finding extends an existing guard and shows the case that needs it. The in-place admission path is introduced by the change.

## 2. Test refusal when the writer-record listing fails

**Action.** Add a committed test using the temporary run-store helper (storedBorrows), a malformed record.json and a fresh borrow; assert refusal, no worktree reads or precheck, and lock release.

**Why.** The evidence holds. The reviewer names the guard (inplace.go:190-192) and traces that no borrower test supplies a listing error: writer fixtures use readable records (inplace_test.go:514), and the existing listing-error test exercises continuation (continuation_test.go:72). The trace also shows that without the guard, claims receives no records, so the guard is the only refusal protecting writer exclusion when the listing is incomplete. That supports the stated major severity for an unprotected guard. The guard is new in the change.

## 3. Prove workspace verification receives only the remaining time

**Action.** Add a test with the existing settableClock: a 60-second call, a 30-second verification limit and a turn consuming 50 seconds must give the command a 10-second timeout.

**Why.** The evidence holds. The reviewer traces the remaining-time cap (verify.go:428) into CommandRequest.Timeout (verify.go:509). The workspace tests use a fixed clock and never assert the timeout (inplace_verify_test.go:70, 83). The existing remaining-time test goes through the clean-copy path, not checkInWorkspace (verify_test.go:443). The concrete case (60-second call, 30-second verification limit, 50 seconds spent) yields a command that exceeds the call limit by 20 seconds, against ADR-002 rule 5. The rationale that the calculation bounds command lifetime for the whole new workspace-verification path is supported by the trace, so major stands.

## 4. Prove failed capture produces no provenance claim

**Action.** Add an in-place call test with changesSpy.changeErr set; assert an empty InPlace.Content, no artifact and ARTIFACT_FAILED.

**Why.** The evidence holds. The reviewer traces that the unverified capture-failure return (calls.go:1665) feeds record.InPlace.Content (calls.go:947). The existing capture-error test runs on a temporary call that never records that field (calls_test.go:1145), the provenance assertion covers only the verified branch (inplace_verify_test.go:308), and the continuation fixture clears Content by hand (inplace_continue_test.go:198). No test therefore proves the producer writes the empty content that continuation relies on (inplace.go:445). Minor is supported: the missed regression would falsify provenance and continuation eligibility, with no demonstrated loss of the worktree.

## 5. Records written before `ProcessesEnded` existed do not refuse a borrow by themselves

A record written before this branch has no `ProcessesEnded` field, so today it reads as "not known to have ended". Every in-place borrow then asks the process seam about the old checkout-less runs in the worktree. A recycled process-group ID among them refuses the call. The owner's store has 34 such records.

Make the field tell "absent" apart from `false`. Treat a record with the field absent that finished normally (not abandoned, not finished by a reap) as ended. Treat an absent field on an abandoned or reaped record as not known, as now. Test both cases, and keep an explicit `false` refusing as now.

## 6. A killed checkout-less call is reapable

A checkout-less call killed after its workspace is recorded (`calls.go`, where the workspace is saved) and before its process is recorded stays unfinished with nil `Effects`. No reap finishes it (`fsruns.go` skips records with nil Effects), so it blocks in-place borrows of that worktree for good.

Apply round 1's fix here too: set an empty `Effects` before that save. Add a committed test with the temporary run store: kill at that point, reap, and check that a borrow is then admitted.

## 7. State the one-sided coordination

A checkout-less call takes no worktree lock and does not check for an in-place call already running there. Do not change that behaviour. State it as a limitation in ADR-022 rule 9 (the boundary), and in the caller skill's rule about not changing the worktree while a call runs.

## 8. Docs say what the binary now refuses

ADR-022 rule 3, `README.md` and `skills/agister/SKILL.md` still describe the refusal as "a run that records the same worktree". The binary now refuses on **overlap** (the directory is the worktree, inside it, or contains it; and for removal, the cleanup parent). It refuses for any run, whether in-place, temporary or checkout-less, that may still write there or whose directory Agister may still remove.

- Update ADR-022 rule 3 and its amendment to ADR-001 rule 12 to say exactly this. ADR-022 is accepted on this unmerged branch, so edit it in place.
- Update the README and the skill to match. Keep `cmd/agister/caller_skill_test.go` passing.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

List every file you changed.
