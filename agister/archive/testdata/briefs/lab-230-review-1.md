# LAB-230 review 1: the two test gaps the review ruled fix

## Goal

`testdata/briefs/lab-230-goal.md`

## Covers

- 2: a test keeps `resolve.go` reading through the reader.
- 5: the stopping proof covers a listed workflow whose read fails.

## Acts on

Code review run `20261012T212706Z-5bfae0`:

- 2#1 (major, fix): no test stops `resolve.go` from bypassing the reader. Add a committed structural test that fails when `internal/app/resolve.go` reads a document from the `definitions` port directly or calls any `definition.Parse*` function. Prove the test's own detection with focused fixtures in a temp directory. Importing `definition` for its types stays allowed in `resolve.go`.
- 2#2 (minor, fix): the stopping-order table in `internal/app/resolve_test.go` skips a listed workflow whose read fails. Supply the list and the read independently, with the existing `failingSource` helper, and cover a listed workflow's read error with a case that asserts the refusal and the exact sequence of reads up to the stop.

## Constraints

- Tests only: change no production file, and not the `coupling` allow-list.
- The structural test sits with the other architecture tests of its kind (`internal/archtest`, or `internal/app` beside `TestTheUseCasesThatOnlyMoveDocumentsImportNoParser`, whichever already holds that seam).
- Do not commit.

## Open

None.
