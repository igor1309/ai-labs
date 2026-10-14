# LAB-233 step 1: the snapshot's parses move to the reader's file, and the one-file guard

## Goal

`testdata/briefs/lab-233-goal.md`

## Covers

- 1, 2, 3, 4, 5, 6: the whole goal.

## Constraints

- Change no logic and no order of reads in `snapshot.go`: only who calls the parser.
- `reader.go` already has `parsedAgent(name, data)` for create-agent; shape the helpers so that there is one way to parse a kind from a document, not two.
- A new helper is tested in `internal/app/reader_internal_test.go`, as the existing ones are.
- No documentation gate applies: no command, flag, setting or output changes.
- Do not commit.

## Open

None.
