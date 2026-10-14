# LAB-43 review round 1 fixes

The code_review workflow run 20261006T192743Z-715c9c ruled these items to fix. Do each as its action says. Change nothing else.

## 1. A stale verification run can be marked passed

**Action.** Add `ran.Stale == nil` to the pass condition at agister/internal/app/verify.go:258, and add a deterministic regression test that supplies Stale=true with exit code zero and unchanged content through the existing command-result seam.

**Why.** Two reviewers independently trace the same path: the supervisor keeps Stale=true and exit code 0 as separate fields (command.go:107, 119), verify.go:524 turns the flag into ran.Stale, the changed terminal checks at verify.go:241 no longer stop on it, and the predicate at verify.go:258 ignores it. Each gives a concrete sequence (the process exits zero before the watchdog's kill lands; the exit and silence timer are both ready and the timer is selected), and the two do not contradict each other. The quoted ADR-024 rule 8 makes such a run a failed run of its attempt, so success at a verification gate supports major. Scope change holds: the change removed the early stale stop.

## 2. A stale recovery reporting another session skips the session check

**Action.** Change the guard in recovery.resume (agister/internal/app/recover.go:178) so a session mismatch is rejected before the recovery is classified or another resume is admitted, and extend the wrong-session test at recover_test.go:489 with a stale wrong-session case.

**Why.** The trace is concrete: recover.go:174 returns a non-nil fault for a stale recovery, the session check at recover.go:178 runs only when fault == nil, recover.go:188 classifies the turn as different_limit, and recover.go:98 and 149 admit the next recovery in the mismatched session. The case is a specific sequence (no_event in prov-1, then repeated_tool_calls reporting prov-2, with two resumes available). ADR-024 rule 9, as presented, requires the resumed and reported sessions to match and a different one to fail as a contract violation. Continuing work in the wrong session supports major. Scope change holds: recover.go is the change's code.

## 3. No test proves verification repairs share the spent resume budget

**Action.** Add one scripted application test in agister/internal/app/recover_test.go that spends the sole resume on the initial turn, then reaches another stale limit during a verification repair, and asserts that no further recovery starts.

**Why.** This is a missing-test goal finding with the required parts. The goal condition is quoted with its place (Scope item 3: one resume budget per call, shared across kinds). The break is concrete: resetting r.left at recovery.take's entry (recover.go:95). The trace shows why every assertion still passes: chained recoveries call resume directly (recover.go:105), the stale-repair test has spent no resume before its repair (recover_test.go:565), and verification re-enters take (verify.go:304). The traced result, a call paying for more recovery turns than its configured ceiling, supports major for a test gap on the per-call limit.

## 4. Recovery accounting is not tested with cumulative session totals

**Action.** Extend the recovery accounting test at agister/internal/app/recover_test.go:447 with cumulative SessionTotals in a recovery scenario, and assert SessionBefore, the recovery's own cost and usage, the call total, and the budget of a subsequent turn.

**Why.** The test gap is proven: passing nil instead of stale.Session at recover.go:168 leaves every recovery cost assertion passing, because the fixture at recover_test.go:453 sets direct CostUSD and never Session totals. The trace then reaches an unknown recovery cost and an unknown call total (session.go:28, recover.go:172, attempts.go:85). The severity rationale rests on changed budget enforcement and call completion, but the trace stops at the unknown total: no step shows an unknown total refusing a later turn or changing completion. The traced effect is corrupted cost evidence in the record, which supports minor, so the finding counts at minor. Scope change holds: the tests and recover.go are the change's.

## 5. No test covers content changed by a silent verification command

**Action.** Add one case using the existing in-workspace content fake and stale command fixture: a silent command that changes content, asserting its After, run patch, repair message and the repair patch's starting content.

**Why.** The trace is concrete: restoring ran.Stale != nil to the early return at verify.go:446 leaves the new silent-run assertions passing, because the stale fixture (spies_test.go:522) changes no content and the content-changing test (inplace_verify_test.go:264) never goes stale. The traced effect is the silent command's changes attributed to the following repair, which matches the stated minor severity. Scope change holds: the guard was changed by this change.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

Tests are committed and deterministic: injected clock and seams, no wall-time waits, no mutation or revert checks. List every file you changed.
