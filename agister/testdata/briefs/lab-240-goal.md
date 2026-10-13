# LAB-240: one file of app imports the parser

## Intent

`internal/app/reader.go` is the one file of `app` that parses a settings document, and it returns `app`-owned types for every parsed kind a consumer uses (LAB-234 to LAB-239). A handful of uses of the parser package are left in other files of `app`: the input names `definition.PromptInput` and `definition.GuidanceInput` and the input source names `definition.PromptSource` and `definition.CollectionSource` in `calls.go` and `check.go`, `definition.ValidName` in `check.go` and `definitions.go`, `definition.ObsoleteWorkspace` in `check.go`, and `definition.WithHome` in `with_document.go`. This slice closes the step: `reader.go` is the only non-test file of `internal/app` that imports `internal/domain/definition`, so that moving the parser behind an edge component later concerns one file of `app`. Behaviour does not change.

## Done when

1. No non-test file of `internal/app` other than `reader.go` imports `internal/domain/definition`.
2. Each of the remaining uses is reached through `reader.go` under a name of `app`'s own: the four names as constants or values that take the parser's, so that no text is written twice; `ValidName`, `ObsoleteWorkspace` and `WithHome` through small helpers that call the parser's unchanged.
3. The reader's blocks method returns nothing of the parser's type to a consumer: if a consumer reads a value of the parsed blocks, it gets an `app`-owned type as the other kinds do; if none does, the method returns what the consumers use and no more.
4. One committed architecture test in `internal/archtest/formats_test.go` fails if a non-test file of `internal/app` other than `reader.go` imports the parser package, under any import name. It is proved on fixtures in a temp directory. The guards it makes redundant (the `Parse*` guard and the `ownTypes` guard, with their fixture tests) are removed, not kept beside it. The guard that keeps `resolve.go`, `check.go` and `definitions.go` from reading a document from the `definitions` port directly stays.
5. Every output, message, exit code and JSON of `agister` is unchanged; the existing tests pass unedited, except where a test names an unexported helper or type this change removes or replaces, and except the architecture tests criterion 4 removes.
6. `scripts/test.sh` passes.

## Out of scope

- Giving the names and `ValidName` a core-owned home outside the parser, and moving the reader or the parser: that is the reader's move to the edge (LAB-226).
- The `coupling` allow-list in `internal/archtest/formats_test.go`: "app imports definition" stays, since `reader.go` still imports it; the list neither grows nor shrinks.
- The writer; splitting `app`.

## Decisions

- The advisor's ruling in run `20261013T021809Z-2ac2f8`: the parser coupling leaves the allow-list only when every use is gone; until the reader moves, its uses are gathered in one place.

## Open

None.
