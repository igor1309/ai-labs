# LAB-108 review round 1 fixes

The code_review workflow run 20261007T000446Z-644414 ruled these items to fix. Do each as its action says. Change nothing else. The change they belong to is described in `agister/testdata/briefs/lab-108-touched-and-denied.md`.

## 1. The runs show proof marshals a wrapper struct, not the actual run.Record

**Action.** In agister/internal/app/trail_test.go, marshal the actual record, assert its `trail` field, and verify that it survives unmarshalling.

**Why.** The evidence holds. The case is concrete: with run.go:276 set to `json:"-"`, the stored record and runs show lose the trail. The trace shows every assertion still passes: trail_test.go:107 marshals an anonymous struct with its own tag, and the actual record is marshalled only in the no-trail case (line 126). Scope `change` is supported, because the test and the Trail field are both part of the change. Major is supported: the traced break removes the whole caller-visible trail while the test named as its proof stays green.

## 2. No test proves a denial is persisted before the turn returns

**Action.** In agister/internal/app/trail_test.go, immediately after reporting a denial, assert that the latest recorder Update contains it, including a denial-only case with no subsequent touch.

**Why.** The evidence holds. The case is concrete: with Denied at calls.go:1913 assigning in memory instead of calling keep, a kill before the next record write loses the denial from the persisted trail. The trace shows why the tests stay green: the mid-turn snapshot at trail_test.go:65 is taken before the denials, the final check reads the in-memory record, and the stale test's later touch (line 146) saves the accumulated denial. Scope `change` is supported. Major is supported by the cited README contract (README.md:108–120) that a killed turn keeps what it reported.

## 3. A repeated path does not retry a trail save that failed

**Action.** In agister/internal/app/calls.go, retry an unsaved trail on subsequent touches, including repeated paths, and add a regression test that fails the first update and then repeats the path.

**Why.** The evidence holds. The sequence is concrete and traced: keep ignores the Update error (calls.go:1922), a repeated touch returns the same trail pointer (trail.go:42), and the equality guard (calls.go:1919) then skips Update, so a run killed at that point leaves a.go out of record.json. Scope `change` is supported. Minor is supported and is the reviewer's own rating. The benefit is narrow: it needs a transient save failure, a repeated path and a kill before any other write. The presented cost is equally small, so the presumption for a minor stands.

## 4. A newline in a touched path forges extra watch lines

**Action.** In describe in agister/internal/cli/cli.go, quote or escape the displayed path while retaining the original value in the record, and cover a newline-containing filename in the CLI test.

**Why.** The evidence holds. The input is concrete: a Write whose file_path is "a.go\n! denied: Bash fake". The trace follows it unchanged from claudecode.go:437 through calls.go:1903 to cli.go:736, where printable (cli.go:695) keeps the newline and watch prints one touch as two lines. Scope `change` is supported, and the quoted requirement is one line per event. Minor is supported: the stored JSON stays correct. The reviewer rates the change risk broad but says ordinary output can be preserved, so cost against benefit is unresolved and the presumption for a minor stands.

## Constraints

- Regular committed tests only: fakes, fixtures, `t.TempDir()`. No mutation or revert checks.
- Match the surrounding code.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

List every file you changed.
