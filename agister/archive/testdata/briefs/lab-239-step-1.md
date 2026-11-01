# LAB-239 step 1: a process and a verification in app's own types

## Goal

`testdata/briefs/lab-239-goal.md`

## Covers

- 1 to 11: the whole goal.

## Constraints

- Follow the shape the earlier kinds gave: the type in a file of its own in `internal/app` (`service.go`, `mapping.go`, `agent.go`, `prompt.go`, `brief.go`, `skill.go`, `declared_workflow.go`, `declared_inputs.go`), the mapper in `reader.go`.
- Change no logic, no message and no order of reads. Where a consumer read a field of a parser type, it reads the same value from the new type.
- Say in the notes each parser function or method a consumer still reaches through a helper in `reader.go`, each method that moved with a type, and anything the goal's criteria did not foresee. If a criterion cannot be met without changing an output, stop and say so under Open.
- The reader's tests are in `internal/app/reader_internal_test.go`.
- No documentation gate applies: no command, flag, setting or output changes.
- Do not commit.

## Open

None.
