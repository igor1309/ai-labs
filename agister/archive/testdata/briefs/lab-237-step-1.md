# LAB-237 step 1: a prompt, a brief form and a skill in app's own types

## Goal

`testdata/briefs/lab-237-goal.md`

## Covers

- 1 to 9: the whole goal.

## Constraints

- Follow the shape the earlier kinds gave: the type in a file of its own in `internal/app` (`service.go`, `mapping.go`, `agent.go`), the mapper in `reader.go` (`serviceOf`, `mappingOf`, `agentOf`).
- Change no logic, no message and no order of reads. Where a consumer read a field of a parser type, it reads the same value from the new type.
- Say in the notes each parser function or method a consumer still reaches through a helper in `reader.go`, and anything the goal's criteria did not foresee.
- The reader's tests are in `internal/app/reader_internal_test.go`.
- No documentation gate applies: no command, flag, setting or output changes.
- Do not commit.

## Open

None.
