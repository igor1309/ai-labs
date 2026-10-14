# LAB-235 step 1: a runtime mapping in app's own type

## Goal

`testdata/briefs/lab-235-goal.md`

## Covers

- 1, 2, 3, 4, 5, 6, 7, 8: the whole goal.

## Constraints

- Follow the shape LAB-234 gave the service: `serviceSettings` in `internal/app/service.go`, `serviceOf` in `reader.go`.
- Change no logic, no message and no order of reads. Where a consumer read a field of `definition.Mapping`, it reads the same value from the new type.
- If a consumer needs a value of the mapping the goal's criterion 1 does not name, add the smallest field for it and say so in the notes.
- The reader's tests are in `internal/app/reader_internal_test.go`.
- No documentation gate applies: no command, flag, setting or output changes.
- Do not commit.

## Open

None.
