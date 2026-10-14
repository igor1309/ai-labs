# LAB-43 review round 2 fixes

The code_review workflow run 20261006T194509Z-dfbb8a ruled these items to fix. Do each as its action says. Change nothing else. ADR-024 is `agister/docs/adr/024-a-stale-call-is-resumed-once.md`.

## 1. A stale repair that reports another session is recovered in that session

**Action.** Check a resumed turn's nonempty reported session ID against request.ResumeSessionID before admitting recovery in recovery.take, and add a scripted regression in recover_test.go asserting runtime_error and no recovery turn in the other session.

**Why.** The evidence holds. The case is concrete (first turn in prov-1, verification fails, the repair requested in prov-1 reaches no_event but reports prov-2, one resume left) and traced step by step: verify.go:300/306 into the recovery-wrapped take, recover.go:98 admission with no comparison, recover.go:149/159 taking prov-2 as the recovery session, recover.go:182 accepting the matching report, verify.go:310 skipping the session check on the timeout fault. The quoted requirement (ADR-024 amendment: a repair or recovery reporting another session fails as a contract violation) connects the trace to the consequence. Major is supported: a real extra turn runs in the wrong session and the call is misclassified as timeout. The new guard it asks for is backed by the case that needs it. The adversarial review's coverage line "session checks" presents no trace of this path, so it does not contradict the evidence. Scope change is supported: recover.go is the change's new component.

## 2. No test proves sent evidence survives entry into a verification repair

**Action.** Add a scripted case in recover_test.go with max_resumes 2: recover an initial no_event, fail verification, then make the repair reach no_event; assert timeout, three turns, and only one recovery.

**Why.** The evidence holds as a missing-test finding: a concrete break (resetting r.sent at recovery.take entry, r.left unchanged) is traced through recover.go:94/105/123 and verify.go:306, and the trace shows why both existing cases (recover_test.go:659 and :693) stay green. The quoted requirement (Goal Scope 3 no_event, ADR-024 rule 3, review definition of done 1) makes the behaviour one the goal requires. The claimed major is not supported: the trace shows the code is correct today, and the stated consequence arises only under an edit nobody has made. The same review rates a test-only gap minor in 2#3 and calls an evidence-quality problem minor in 2#1's rationale. It counts as minor. At minor the presumption is fix, and the presented cost does not exceed the benefit.

## 3. Truncation tests never cut inside a UTF-8 rune

**Action.** Add prefix- and suffix-offset fixtures to the Codex, OpenCode, Pi and Claude Code adapter tests that require adjustment at both cuts, asserting exact output and valid UTF-8.

**Why.** The evidence holds. The trace names the raw cuts and the adjustment loops in each adapter (codex.go:920-925, opencode.go:726/729, pi.go:761/764, claudecode.go:604) and shows that each fixture's cuts are already aligned, so the guards are unexercised. Concrete inputs that split a rune are given ("a" + 1024 "é"; 1024 "é" + "a"). The requirement is quoted from definition of done 1 and each adapter's "each cut on a rune boundary" contract. Minor is supported: evidence-preservation guards are unprotected while admission and termination stay intact. The presented cost (substantial but contained) is not shown to exceed the benefit, so the presumption for a minor stands.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

Tests are committed and deterministic: injected clock and seams, no wall-time waits, no mutation or revert checks. List every file you changed.
