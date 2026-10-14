# LAB-229 step 2: the code_review run 20261012T210144Z-adfdbc ruled one item to fix

## Goal

`testdata/briefs/lab-229-goal.md`

## Covers

- 2: `definition` keeps none of the moved names, and a test fails if one comes back.

## Acts on

From the judgement of code_review run 20261012T210144Z-adfdbc, ruled fix:

1. **No test guards against restoring the moved vocabulary's exports in definition** (2#1, minor). In `internal/archtest/formats_test.go`, add a source-level assertion that `internal/domain/definition` declares none of the moved exported names. Prove its helper on temporary-file fixtures: a type alias, a re-exported constant or variable, and a forwarding function.

## Constraints

- Change nothing else.
- Do not commit.

## Open

None.
