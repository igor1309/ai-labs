# LAB-114 step 2: `workspace.revision`, and the checkout machinery goes

Step 2 of 3 for ADR-025 (`agister/docs/adr/025-a-call-works-where-it-is-called.md`,
accepted). Step 1 (commit d9242387, "every call works in the caller's
worktree") made the caller's worktree the only path for new calls and
left the code of the temporary path unreachable. Step 3, later, does the
done gates (caller skill, README, settings diagrams, Pages,
`agister/AGENTS.md`); do not touch those docs here.

## What changes

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

## Done when

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

## Constraints

- Regular committed tests only: fakes, spies, fixtures, `t.TempDir()`.
  No mutation or revert checks.
- No behaviour change beyond the rename and the removal: what step 1's
  tests assert still holds.
- Match the surrounding code, its comments and naming; comments that
  cite superseded ADRs for kept behaviour cite ADR-025.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.
