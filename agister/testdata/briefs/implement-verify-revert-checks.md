# Repository implement process: revert checks in verify

Your settings change is committed (7f85e658). An implementer's report of
its revert checks is a claim; make Agister run them instead.

Extend `verify.command` in `.agister/processes/implement.yaml` so that,
after the current checks pass, it runs `scripts/revert-check.py` on every
spec in `agister/testdata/revert-checks/` from the repository root, in
parallel, and fails if any spec fails (every spec's output kept, so a
failure says which spec and which mutation). Measure how long the full
command takes in this checkout and set `verify.timeout` to about twice
that, within the policy's 45-minute call timeout; say what you measured.

Keep `TestRepositoryProcessesRunOnFakeRuntimes` passing (it already gives
verify processes a fixture command). Agister runs the verification command
after your turn. List every file you changed. Do not commit.
