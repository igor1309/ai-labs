# Review round 1: the leftover report's tests

Branch `agister-tempdir-leftovers` (brief `tempdir-names-leftovers.md`) is
committed. Fix two gaps in `agister/cmd/agister/tempdir_test.go`; do not
change the helper's behaviour or any other file unless a fix needs it.

1. The report's modification time is not asserted: the test checks only
   the label `modified `. Give the leftover a known modification time
   (`os.Chtimes`) and assert the report contains that exact time in the
   format the report prints.
2. A failed assertion leaks the fake's directories: the fake `testing.TB`
   holds its cleanups only in itself and the package-level `tempRoots`
   map, so a `t.Fatalf` before the explicit drain skips them. Register an
   idempotent drain of the fake's cleanups with the real `t.Cleanup`
   before allocating, and keep the explicit drain the assertions rely on.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 ./... && go test -race -count=1 ./internal/app/...`.

List every file you changed.
