# LAB-234 step 1: the service settings in app's own type

## Goal

`testdata/briefs/lab-234-goal.md`

## Covers

- 1, 2, 3, 4, 5, 6, 7, 8: the whole goal.

## Constraints

- Change no logic, no message and no order of reads. Where a consumer read a field of `definition.Service`, it reads the same value from the new type or from its `policy.Ceilings`.
- If a consumer needs a value of the service that `policy.Ceilings` and the state-reaching primitives do not carry, add the smallest field for it and say so in the notes.
- The reader's tests are in `internal/app/reader_internal_test.go`; the architecture test is in `internal/archtest/formats_test.go` beside the guards of its kind.
- No documentation gate applies: no command, flag, setting or output changes.
- Do not commit.

## Open

None.
