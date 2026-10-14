# LAB-114 step 2, and the step 1 review fixes

This review covers two briefs, both below: step 2 of ADR-025, and the fixes of step 1's review round 1 with a race found while verifying step 2.

## LAB-114 step 2: `workspace.revision`, and the checkout machinery goes

Step 2 of 3 for ADR-025 (`agister/docs/adr/025-a-call-works-where-it-is-called.md`,
accepted). Step 1 (commit d9242387, "every call works in the caller's
worktree") made the caller's worktree the only path for new calls and
left the code of the temporary path unreachable. Step 3, later, does the
done gates (caller skill, README, settings diagrams, Pages,
`agister/AGENTS.md`); do not touch those docs here.

### What changes

1. **`workspace.checkout` becomes `workspace.revision` (ADR-025 rule 2).**
   Same meaning: it names an input that resolves to a revision, and a
   call is refused unless HEAD is that revision. Rename it through the
   settings parser, the domain types, the resolution and everywhere the
   code says "checkout" for it (`CallProcess.Checkout`, `process.Checkout`
   and their comments). A process that still declares `checkout` is
   invalid; the problem says it is now `workspace.revision` (ADR-025).
   Update every process in `.agister/processes/`, `agister/examples/` and
   test fixtures. The JSON schemas under `.agister/schemas/` and any
   schema the code embeds, if they describe the process document, too.

2. **Delete the code no call reaches** now that no new call makes a
   checkout, a setup run or a clean copy:
   - creating and releasing a call's own checkout (`prepareWorkspace`'s
     temporary branch, `workspace.Owned`, `release`, `run.Checkout` as a
     new effect);
   - the setup and precheck: `Preparer`, `SetupCall`, `PrecheckCall`,
     `BorrowPreparer`, `BorrowPrechecks`, and their adapters and wiring;
     the parsing of `workspace.setup` and of `workspace.yaml`'s `setup`,
     `precheck` and `mode` beyond what step 1's obsolete-setting warnings
     need (keep those warnings);
   - verification on a clean copy: `VerifyCopies`, `claimCopy`,
     `removeCopy`, `forgetCopy` and the copy branch of `check`; the
     verify `where` field beyond step 1's warning;
   - carried patches of ADR-013 (`carried`, `onto`, the apply of a
     carried patch) and `CallChanges.Apply` if nothing else uses it;
   - the ADR-008 worktree coordinator, if nothing but checkout creation
     and removal uses it; if the reap's discard of old checkouts still
     needs it, keep it for that only and say so.

3. **Keep, for records made before ADR-025 (rule 9):** the reap still
   removes a checkout or clean copy an old run left on record
   (`CheckoutDiscarder` and its git adapter), and a call is still refused
   while its worktree overlaps such a directory (step 1 kept this
   check). Records still read: `run.Effects.Checkout`, the copy fields,
   `run.InPlace` keep their JSON names.

4. **Names.** Where a name says "in-place" or "borrow" only because it
   used to be one of two modes (`InPlace` on `CallProcess`,
   `Borrower`, `BorrowCall`, the `in-place` lock namespace,
   `inplace.go`), rename it to say what it is now, the call's worktree
   and its hold, if that stays contained. Do not rename the record's
   JSON fields; old records must still read.

### Done when

- The full check passes.
- `go vet` and the tests show no reference left to the removed types
  (`Preparer`, `VerifyCopies`, the carried patch), except what the reap
  of old records needs.
- A test shows a process declaring `workspace.checkout` is reported by
  `check` as invalid, naming `workspace.revision`.
- A test shows the reap still removes an old run's checkout on record,
  and a call is still refused while its worktree overlaps one (these may
  exist from step 1; say which).
- Every process and fixture in the repository says `revision`.

List, by name, the tests you deleted with the code they covered.

### Constraints

- Regular committed tests only: fakes, spies, fixtures, `t.TempDir()`.
  No mutation or revert checks.
- No behaviour change beyond the rename and the removal: what step 1's
  tests assert still holds.
- Match the surrounding code, its comments and naming; comments that
  cite superseded ADRs for kept behaviour cite ADR-025.

### Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

## LAB-114 step 1, review round 1 fixes

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

### Constraints

Regular committed tests only; no mutation or revert checks. Match the
surrounding code.

### Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.
