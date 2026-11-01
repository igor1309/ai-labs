# LAB-101 review round 1 fixes

The candidate implements ADR-023 (`agister/docs/adr/023-reviewers-know-the-goal.md`).
A review found two defects. Fix both; change nothing else.

1. `prompts/code-review-judge.md` around line 75 requires every `goal`
   finding to trace how the defect stops the scenario's outcome. ADR-023
   rule 3 also admits a missing test: a specific goal behaviour that the
   existing assertions let break. Case: the goal requires reporting failed
   writes; the code returns the error correctly, but the tests assert only
   successful writes; the reviewer shows that returning `nil` instead
   leaves every assertion green. The judge prompt must accept that as a
   `goal` finding. Extend the prompt-contract test in
   `agister/cmd/agister/repo_settings_test.go` (`TestReviewPromptsCarryTheGoal`
   or its neighbour) to hold the judge prompt to it.

2. `prompts/code-review-adr.md` line 10 says "A change that touches no ADR
   has no finding here", while line 57 now admits a `goal` finding on an
   earlier decision the change does not touch. Case: an implementation-only
   commit pursues a goal an accepted ADR forbids. Qualify the opening so
   the restriction holds for `change` findings, and the goal can still
   raise a `goal` finding. Update the prompt-contract test if it checks
   that line.

Bump the patch version of each prompt you change.

## Check

From the repository root: `agister check` exits 0. From `agister/`:
`test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 ./...`.

List every file you changed.
