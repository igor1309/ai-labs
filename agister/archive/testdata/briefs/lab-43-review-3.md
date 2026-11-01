# LAB-43 review round 3 fixes

The code_review workflow run 20261006T195717Z-034a38 ruled these items to fix. Do each as its action says. Change nothing else. ADR-024 is `agister/docs/adr/024-a-stale-call-is-resumed-once.md`.

## 1. Check session identity on ordinary failed recoveries too

**Action.** In recovery.resume (agister/internal/app/recover.go:190), reject every nonempty reported session that differs from the resumed session, preserving the missing-session handling. Add a scripted wrong-session failure case beside the existing recovery failure test in recover_test.go.

**Why.** The evidence holds at minor. The case is concrete: a recovery resumes prov-1 and returns Failed/rate_limited reporting prov-2. The trace follows it from recover.go:167 through the guard at recover.go:190, which evaluates false because fault is non-nil and endedStale is false, to the rate_limited class recorded at :207 and returned at :123. The quoted ADR-024 rule 9 requires any different session to fail as a contract violation, so the scope is the change. Minor is supported: the call already fails and starts no further recovery, but an accepted ADR is contradicted and the recorded class is wrong. The presented cost does not exceed the presented benefit, so the minor presumption stands.

## 2. Recovery never exercises the CLI composition

**Action.** Add a recovery case through composition.wire or the composed CLI in the command package, using the existing in-process runtime seam.

**Why.** The evidence holds at minor. The case is concrete: without the clock field at main.go:318 the Recoverer built at gate.go:115 holds a nil clock, NewRecoverer does not reject it (recover.go:31), and recover.go:140 calls it on the first recoverable stale turn. The trace shows the only recovery test supplies its own NewRecoverer(with.clock) at verify_loop_test.go:448 and uses the composed CLI only for init and runs show, so every assertion stays green. The wiring is new in the change, so scope `change` is supported. Minor is supported: the candidate wiring is correct and the break needs a later regression, but a whole caller path is unprotected against a panic. The presented cost is tests only and contained, below the benefit.

## 3. Persisted recovery cost is not proven

**Action.** In the command-package record test (agister/cmd/agister/verify_loop_test.go:1239), assert the recovery's own cost after reading the stored record and after decoding runs show.

**Why.** The evidence holds at minor. The case is concrete: with Recovery.CostUSD's JSON tag at recovery.go:34 set to `json:"-"`, the cost disappears from stored records and runs show. The trace shows the only cost assertion (recover_test.go:467) reads an unserialized spy record (spies_test.go:718), while the stored-record and runs-show assertions at verify_loop_test.go:1239 and :1244 check outcome, digest and identity but not cost. The requirement cites review definition of done 4 and goal Scope 4 (each recovery record names what that turn cost); the record field is part of the change. Minor is supported: cost is recorded correctly today, but explicitly required durable evidence can be lost unnoticed. The presented cost is assertions only, below the benefit.

## 4. Recovery identity tests do not distinguish truncated inputs

**Action.** Add table-driven cases in agister/internal/app/recover_test.go for both tool-based limits (repeated_tool_calls and tool_command), using different inputs with an identical first 300 bytes, and assert that the second stale input receives its own recovery.

**Why.** The evidence holds at minor. The case is concrete: with stale.Tool.Input substituted for stale.Tool.SHA256 at recover.go:229, two Bash inputs sharing their first 300 bytes are treated as the same evidence and the second is refused despite an available resume. The trace shows stale.go:268 truncates recorded input to 300 bytes, the different-call case at recover_test.go:365 uses short inputs that stay distinct either way, and stale_test.go:191 checks digest generation without recovery admission. The quoted ADR-024 rule 3 identifies tool evidence by the whole-input digest. Minor is supported: the candidate uses the correct digest, but the uncovered distinction decides whether recovery proceeds. The presented cost is a table-driven test with no product change, below the benefit.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

Tests are committed and deterministic: injected clock and seams, no wall-time waits, no mutation or revert checks. List every file you changed.
