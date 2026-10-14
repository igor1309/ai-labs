# LAB-233: the snapshot parses through the reader's file; app parses settings in one file

## Intent

`internal/app/reader.go` holds the typed reader and the parsing helpers of `app`. The Resolver, the Checker and the lists read through it (LAB-230, LAB-231, LAB-232). One place is left: `internal/app/snapshot.go` calls `definition.ParseProcess` and `definition.ParseAgent` on documents it has already read and frozen, to find the verification, the prompts and the skills they name. This slice routes those two parses through the reader's file and adds the guard that closes the step: `app` parses settings documents in one file. Behaviour does not change.

## Done when

1. `internal/app/snapshot.go` calls no `definition.Parse*` function. It parses the documents it froze through parsing helpers in `internal/app/reader.go`, which take a document already read; the snapshot does not read a document a second time to parse it.
2. The snapshot keeps its eager freeze, unchanged: it reads every document once from its source, clones what it returns, replays read and list errors, keeps the read of a named prompt apart from the read of an inventory prompt, and an edit made after the snapshot is built stays invisible. The snapshot reads its source directly; it is the port the reader later reads, not a consumer of the reader.
3. A committed architecture test fails if any non-test file of `internal/app` other than `reader.go` names a `Parse*` function of the `definition` package. It is proved on fixtures in a temp directory, as the existing test of its kind is.
4. The existing architecture test that keeps `resolve.go`, `check.go` and `definitions.go` reading documents through the reader stays, and its rule on the port's `Read` and `ReadListed` is unchanged; where the new test makes its `Parse*` half redundant, the two are merged or the half is dropped, not duplicated.
5. Every output, message, exit code and JSON of `agister` is unchanged; the existing tests pass unedited, except where a test names an unexported helper this change removes.
6. `scripts/test.sh` passes.

## Out of scope

- A lazy or memoizing reader in place of the snapshot.
- Types of the reader's own, and moving the reader, the parser, the session modes or the input source names out of where they are.
- Narrowing the ports of the reader's consumers.
- The `coupling` allow-list in `internal/archtest/formats_test.go`: it neither grows nor shrinks.

## Decisions

- The shape is the advisor's ruling in run `20261012T211336Z-aea15b`: first-use memoization does not replace the snapshot's contract, so the snapshot keeps its freeze and only its parsing moves.

## Open

None.
