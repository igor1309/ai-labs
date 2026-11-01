# LAB-108 review round 3 fix

The code_review workflow run 20261007T045223Z-0bf233 ruled this item to fix. Do it as its action says. Change nothing else. The change it belongs to is described in `agister/testdata/briefs/lab-108-touched-and-denied.md`.

## 1. Prove the Claude Code runner delivers denials while the transport is still running

**Action.** In agister/internal/adapters/runtime/claudecode/transport_test.go, add a test-local transport that feeds a result line containing denials through onLine. Right after onLine returns, and before the transport's Run returns, assert that the denials have reached the sink. Use the existing transport interface as the seam; no real process or timed wait.

**Why.** The evidence holds. The reviewer gives a concrete break: move the TakeDenials/PermissionDenied loop at claudecode.go:226–228 to after Transport.Run. The trace shows every assertion that could catch this still passes. The fake transport at runtimetest.go:482–486 never checks the sink between the last callback and its return. transport_test.go:139–153 asserts only after RunTurn has finished. claudecode_test.go:465 calls TakeDenials directly. trail_test.go:151 skips the adapter. The trace also follows the consequence: calls.go:1913 persists PERMISSION_DENIED only when Denied is called, so a run killed before the process exits loses the denial. The requirement quotes Goal Scope item 3 ('A turn that a staleness limit ended, or that was killed, keeps the events recorded before it ended.'), and the delivery loop is code this change added, so scope 'change' is supported. Losing all denial evidence in a scenario the goal names supports the major severity.

## Constraints

- Regular committed tests only. No mutation or revert checks.
- Match the surrounding code.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

List every file you changed.
