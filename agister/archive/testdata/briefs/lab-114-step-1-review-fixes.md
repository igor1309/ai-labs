# LAB-114 step 1, review round 1 fixes

Code review `20261007T065933Z-ac529c` of step 1 (commit d9242387, ADR-025)
ruled three items fix; a fourth is a race found while verifying step 2
(commit b6383052). Fix these four; nothing else.

1. **Major: no test proves `--dir` is accepted for workflow calls.**
   `TestRunWorksInTheDirectoryDirNames` (`agister/cmd/agister/cli_test.go`)
   drives only `run p`, a process. Extend it, or add one focused test, with
   a workflow call that passes `--dir`, and assert its `Cwd` reaches the
   client and the config, as the process case does.
2. **Minor: the unknown-flag assertion does not prove the error is for
   `--workspace`.** The test (cli_test.go, around the `--workspace` case)
   checks only `ExitUsage`, the substring `workspace` and zero
   submissions. Assert the anchored unknown-flag message, such as
   `flag provided but not defined: -workspace`, and keep the
   no-submission check.
3. **Minor: the lock comment contradicts shared readers.** The
   `WorktreeLocks` type comment in `agister/internal/adapters/system/locks.go`
   says two holders in one process exclude each other; readers now take
   `LOCK_SH` together. Make the comment describe shared reader holds and
   an exclusive writer hold.

4. **Race: a reader is refused while a sibling run is being created.**
   Under load, `TestReviewNodesReceiveTheGoalAndTheJudgeDoesNot` and
   `TestRepositoryProcessesRunOnFakeRuntimes/workflow_code_review` fail
   about one run in four: a review node is refused with "the runs that
   may still write in worktree ... cannot be read: listing run <id>: run
   <id>: not found". `fsruns.Store.Create`
   (`agister/internal/adapters/fsruns/fsruns.go`) makes the run directory
   before it writes `record.json`, and `ListStrict` fails on any run it
   cannot read. Concurrent nodes of a workflow now take their holds while
   siblings are being created. A run whose directory holds no
   `record.json` yet has recorded nothing, so nothing of it is on record:
   the strict listing skips it, and still fails on a record that exists
   but cannot be read or parsed. Say so in `ListStrict`'s comment. Prove
   it with a regular `fsruns` test in a `t.TempDir()`: a run directory
   without `record.json` is left out of `ListStrict`, and a run whose
   `record.json` is not valid JSON still fails it.

## Constraints

Regular committed tests only; no mutation or revert checks. Match the
surrounding code.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.
