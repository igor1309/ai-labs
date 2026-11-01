# LAB-7 slice A: review fixes

Your slice A work is committed (f192cdcf); this checkout is the current
branch head. Apply these rulings of the review judge (run
20260930T081256Z-dff1e7), as written:

1. **The end-to-end verify test is only bounded at five minutes, above the one-minute limit** (major). Use shorter durations in TestVerifyDeclarationEndToEnd, for example a 30s call timeout, a 20s verify timeout and a 10s refusal timeout, and update the expected values to match.

2. **The warning-printing test never sets settings problems at the same time** (minor). Add a CLI test whose report has both Problems and Warnings. Assert that the warning is printed, that the problem text is printed, and that the result is ExitUsage.

Add a mutation for fix 2 to
`agister/testdata/revert-checks/verify-declaration.spec` (the warning loop
moved below the problems return), caught by the new test.

Run and report, each with exit code and final line: from `agister/`,
`gofmt -l .`, `go vet ./...`, `go test -count=1 ./...`; from the
repository root, `scripts/revert-check.py` on every spec in
`agister/testdata/revert-checks/`. List every file you changed. Do not commit.
