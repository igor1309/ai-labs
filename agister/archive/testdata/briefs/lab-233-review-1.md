# LAB-233 review 1: the three test gaps the review ruled fix

## Goal

`testdata/briefs/lab-233-goal.md`

## Covers

- 1, 2: tests prove the snapshot reads each document once and freezes what it returns.
- 3: the one-file guard sees every name the parser is imported under.

## Acts on

Code review run `20261013T020404Z-42fd52`:

- 2#1 (major, fix): no test asserts what the snapshot reads from its source while it is built. In `internal/app/snapshot_test.go`, add a table-driven test over a counting source that asserts the `Read` and `ReadListed` count of each document right after the snapshot is constructed. Cover listed documents, a document two others name, and a named document the source lacks.
- 2#2 (minor, fix): the immutability test does not prove that a document's mutable metadata is frozen. In `internal/app/snapshot_test.go`, add a fake that retains the documents it gave and a table that mutates each mutable field (`Bytes`, `Source.Layers`, and each layer's `Fields` and `Texts`), both through the source's retained values and through what the snapshot returned, and asserts that later results are unchanged.
- 3#1 (minor, fix): the parse guard in `internal/archtest/formats_test.go` keeps only the last name a file imports the `definition` package under. Collect every such name, and add a temp-directory fixture that imports `definition` twice under different names.

## Constraints

- Test code only. If a new test shows the snapshot does not hold one of these properties, do not change the test to pass: fix the production code in the smallest way and say so in the notes.
- Do not commit.

## Open

None.
