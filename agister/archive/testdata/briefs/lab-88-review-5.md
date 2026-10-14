# Review fixes for the in-place workspace (LAB-88, review round 5)

The code_review workflow run 20261006T143919Z-a1b768 ruled these items to fix. Do each as its action says. Behaviour does not change; existing tests keep passing, and test doubles move to the new Borrower-owned types. Change nothing else.

## 1. Borrower API uses setup- and reaper-owned types

**Action.** Define Borrower-owned request and result types, and add thin composition-root adapters that translate to the Preparer and process-reaping contracts.

**Why.** The claim is traced end to end: Borrower's own collaborator interfaces carry `PrecheckCall`, `SetupCommand` and `Reaping` (inplace.go:89-99, 117-129), those types are defined by the setup and reaping components (setup.go:175-192, reap.go:42-57), and the composition passes the concrete `Preparer` straight in with no translating adapter (gate.go:110-112, supervisor.go:39-41). That is a direct, change-introduced violation of the three quoted recorded rules. Major is supported by the traced violation in the change's primary component and by the traced fact that a change to either type reaches Borrower's API. One clause is overstated: "cannot be tested" in isolation is not borne out, since the tests review found unit paths on fakes and spies with explicit collaborators. What holds is that those substitutes must speak setup and reaper types. The presented cost is substantial but localized, which is not grossly disproportionate to restoring a recorded boundary.

## 2. NewBorrower takes six positional collaborators despite the existing BorrowAdapters group

**Action.** Change `NewBorrower` to accept `BorrowAdapters` (with the precheck collaborator alongside it or included in that group) and initialize from named fields; update the call sites in the app package and tests.

**Why.** The evidence holds: `BorrowAdapters` groups the five dependencies (inplace.go:103), `NewBorrower` takes them plus the precheck collaborator positionally (inplace.go:113), and the composition root unpacks the group by hand (gate.go:111-112). The change introduced it, and it meets the quoted grouping requirement. Minor is supported as a contained readability problem with no runtime failure. The presented cost is small and contained, so it does not exceed the benefit and the presumption for a minor stands.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

List every file you changed.
