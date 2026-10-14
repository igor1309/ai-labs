# LAB-111 review round 1 fix

The code_review workflow run 20261006T201635Z-25e9e6 ruled this item to fix. Do it as its action says. Change nothing else.

## 1. The new goal-file instruction in agister/AGENTS.md has no regression assertion

**Action.** Add a phrase-based assertion for the sentence beginning "The goal file names" (agister/AGENTS.md:26-28) in agister/cmd/agister/repo_settings_test.go, using promptInstruction and carries, following the existing AGENTS.md assertion.

**Why.** The evidence holds. The case is concrete: deleting the sentence beginning "The goal file names" at agister/AGENTS.md:26-28 leaves every assertion passing. The trace shows why: the new test at repo_settings_test.go:1101/1118 reads only prompts/code-review-clarity.md, the AGENTS.md assertion at :983 covers only waive handling, and :1077 covers review-process instructions. No other review contradicts this. Scope `change` is supported, because the trace shows the change introduced the sentence at AGENTS.md:26 and left it unguarded. The chain from the quoted requirement ("Each changed behaviour has a test that fails when the behaviour is reverted") through the consequence to minor is intact; the rationale supports minor and no more, since the instruction is present and correct and the core exception is guarded. At minor the presumption is fix, and the presented cost (small, test-only, contained) does not exceed the presented benefit.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

No mutation or revert checks. List every file you changed.
