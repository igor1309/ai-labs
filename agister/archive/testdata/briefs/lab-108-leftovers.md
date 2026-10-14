# LAB-108: two leftovers before the merge

The change is described in `agister/testdata/briefs/lab-108-touched-and-denied.md`.
Its implement runs reported two things as left open. Close both. Change
nothing else.

## 1. A `runs watch` line of the trail stays one line

`describe` in `agister/internal/cli/cli.go` quotes a touched path that
holds a newline, another unprintable character, a quote or a backslash
(`TestProgressDescribesTheTrail`). The tool name on a `TOUCHED` line, and
the tool name and the input on a `PERMISSION_DENIED` line, are printed
as they came: a newline in any of them still splits the line and can
forge another event's line. Show them the same way the path is shown, so
each of the two events prints exactly one line whatever its fields hold;
an ordinary value prints as today. The record and the events keep the
original values. Extend `TestProgressDescribesTheTrail` with a tool name
and a denial input that hold a newline.

## 2. A repair turn adds to the trail

No test shows a repair turn (ADR-002: the turn after a failed
verification run) adding to the call's trail. Add one in
`agister/internal/app/trail_test.go`, with the harness the verification
tests use: the first turn writes one path, the verification run fails,
the repair turn writes another path and is denied once, verification
passes; the record's trail holds both paths in order and the denial, and
the events are in stream order. If the product code does not do this,
fix it and say so.

## Constraints

- Regular committed tests only. No mutation or revert checks.
- Match the surrounding code.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

List every file you changed.
