# LAB-108 review round 2 fixes

The code_review workflow run 20261007T001319Z-83ac0d ruled these items to fix. Do each as its action says. Change nothing else. The change they belong to is described in `agister/testdata/briefs/lab-108-touched-and-denied.md`.

## 1. The runs-show trail is not proven through the inspection path (Runs.Inspect)

**Action.** Extend the existing inspection test (TestInspectShowsTheNodeResultAsRecorded in agister/internal/app/other_test.go, using its existing readerSpy) with a populated trail and assert that the decoded view.Record contains it; the existing CLI passthrough assertion then completes the proof.

**Why.** The evidence holds as a goal-scope missing test. The requirement is quoted from Goal, Scope item 4 ("The run's record gains the trail, so that `runs show` prints it"). The case is a concrete break: with the view.Record serialization at runs.go:181 removed, runs show prints only a newline. The trace shows every assertion still passes: trail_test.go:121/131 marshal run.Record directly without Runs.Inspect; other_test.go:383-392 never asserts view.Record; cli_test.go:200/233 feeds prebuilt Record bytes to a client spy. Major is supported: the break removes the whole caller-facing trail, not a detail. The presented cost is small and contained, far from disproportionate, so the burden for a major is met.

## 2. Denial fixtures are already sorted or identical, so record order is not distinguished from sorting

**Action.** Add distinct denials in a non-sorted order to the completed-turn fixture in agister/internal/app/trail_test.go, keep the duplicate-denial case, and assert that exact order in the record and the serialized trail.

**Why.** The evidence holds at change scope: the trail tests are the change's own and claim to prove denial order (trail_test.go:10-12; trail.go:5-7 declares "in the order reported"). The case is concrete: sorting trail.Denied by Tool after the append at trail.go:57 stores Write-then-Bash as Bash-then-Write. The trace shows no assertion fails: the domain fixture has two identical Bash denials; the app fixture is Bash, Bash, Write, already sorted; the fixtures at lines 148 and 224 have one denial; the adapter test never calls run.Trail.Deny. Minor is supported: all denials and the ordered events remain, only the record's chronology is unprotected. The presented cost is small and contained and does not exceed the benefit, so the presumption for a minor stands.

## Constraints

- Regular committed tests only: fakes, fixtures, `t.TempDir()`. No mutation or revert checks.
- Match the surrounding code.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

List every file you changed.
