# LAB-232: the lists and inspect read settings documents through the typed reader

## Intent

`internal/app/reader.go` holds the typed reader: it reads one settings document, parses it and returns the parsed value with its source. The Resolver and the Checker read through it (LAB-230, LAB-231). `internal/app/definitions.go`, which serves the lists, show and create-agent, still reads documents from the `definitions` port and calls `definition.Parse*` itself. This slice moves it onto the reader. Behaviour does not change.

## Done when

1. `internal/app/definitions.go` calls no `definition.Parse*` function and reads no document from the `definitions` port directly (`Read`, `ReadListed`): every document it lists or shows comes through the reader. Listing the names of a kind stays the port's `List`.
2. Create-agent validates the bytes it has just formatted, which is not a read of the settings. That parse goes through a parsing helper in the reader's file; the stored agent is not reread in its place. Formatting (`definition.FormatAgent`) and the writer stay where they are.
3. A listing still tells an entry whose read failed from one that does not parse, and drops neither: what a list and a show report for a broken document is unchanged.
4. The reader gains only what this file needs and the earlier slices did not. It still lists nothing and decides nothing.
5. The architecture test in `internal/archtest/formats_test.go` that keeps `resolve.go` and `check.go` on the reader covers `definitions.go` too, by the same rule; its name says what it covers.
6. Every output, message, exit code and JSON of `agister` is unchanged; the existing tests pass unedited, except where a test names an unexported helper this change removes.
7. `scripts/test.sh` passes.

## Out of scope

- `snapshot.go`: it keeps its own reads and parses until its slice.
- A whole-settings model, and any memo of parsed documents.
- Types of the reader's own: it returns `definition`'s parsed types.
- Calls in `definitions.go` to `definition` functions that do not parse a document.
- The writer and serialization: LAB-227.
- The `coupling` allow-list in `internal/archtest/formats_test.go`: it neither grows nor shrinks.

## Decisions

- The shape and the order of consumers are the advisor's ruling in run `20261012T211336Z-aea15b`, which also ruled on create-agent: route its validation through the reader file's parsing helper, never reread the stored agent as a substitute.

## Open

None.
