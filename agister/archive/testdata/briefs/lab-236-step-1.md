# LAB-236 step 1: an agent in app's own type

## Goal

`testdata/briefs/lab-236-goal.md`

## Covers

- 1 to 10: the whole goal.

## Constraints

- Follow the shape LAB-234 and LAB-235 gave: `serviceSettings` in `service.go` with `serviceOf` in `reader.go`; `runtimeMapping` in `mapping.go` with `mappingOf` in `reader.go`.
- Change no logic, no message and no order of reads. Where a consumer read a field of `definition.Agent`, it reads the same value from the new type.
- If a function of the parser takes a `definition.Agent` from a consumer (`CallSkills` or another), keep its behaviour and call it through a helper in `reader.go`; say so in the notes.
- The reader's tests are in `internal/app/reader_internal_test.go`.
- No documentation gate applies: no command, flag, setting or output changes.
- Do not commit.

## Open

None.
