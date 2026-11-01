# LAB-247 review 2: every writer record is covered, and a failing stub does not hang

## Goal

`testdata/briefs/lab-247-goal.md`

## Covers

- 1 and 6: the exception holds for every kind of writer record, and the tests fail fast.

## Acts on

Code review run `20261013T083352Z-661306`:

- 2#1 (major, fix): every newly allowed case is an `InPlace` record. Writer records without `InPlace` are not covered: a checkout-less run, and finished, released temporary runs whose runtime has not ended. Extend the existing table in `internal/app/hold_test.go` with each writer-directory representation that is supported. Assert admission, and no reaping, across an independent nested boundary. If one of them is refused today, fix the code so that the goal holds, and say so in the notes.
- 2#2 (minor, fix): the new tables' `Root` and `IsSubmodule` stubs call `t.Fatalf` inside the Submit goroutine. A wrong argument then hangs the package until its timeout. In both tables, capture the arguments and assert them after `h.call` returns, or report a nonfatal error and return an error from the callback so that the call completes.

## Constraints

- Do not commit.

## Open

None.
