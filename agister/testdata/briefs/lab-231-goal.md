# LAB-231: the Checker reads settings documents through the typed reader

## Intent

`internal/app/reader.go` holds the typed reader: it reads one settings document, parses it and returns the parsed value with its source. The Resolver reads through it (LAB-230). The Checker in `internal/app/check.go` still reads documents from the `definitions` port and calls `definition.Parse*` itself. This slice moves the Checker onto the reader, so that parsing in `app` comes nearer to one file. Behaviour does not change.

## Done when

1. `internal/app/check.go` calls no `definition.Parse*` function and reads no document from the `definitions` port directly (`Read`, `ReadListed`): every document the Checker checks comes through the reader, the named prompts and the blocks included. Listing the names of a kind stays the port's `List`, called by the Checker.
2. The reader gains only what the Checker needs and the Resolver did not: a method for blocks, a way to read a prompt of the inventory that no process names (the port's `ReadListed`), the source of the workspace settings, the base a process extends, and the source the port gives beside a failed read. It still lists nothing and decides nothing.
3. Enumeration, the order of problems, the checked counts, the treatment of base processes and every cross-document check stay in the Checker. `check` still reports every problem in every document (ADR-015 rule 5).
4. Where the Checker uses what parsed of a document whose parse failed, it still has it: the reader returns the partial value with the parse failure, as the parser does.
5. The architecture test that keeps `resolve.go` on the reader (in `internal/archtest/formats_test.go`, renamed for both: `TestTheResolverAndTheCheckerTakeEveryDocumentFromTheReader`) covers `check.go` too, by the same rule.
6. Every problem text, its order, the counts, the exit code and the JSON output of `agister check` are unchanged, and so is every other command; the existing tests pass unedited, except where a test names an unexported helper this change removes.
7. `scripts/test.sh` passes.

## Out of scope

- `definitions.go` and `snapshot.go`: they keep their own reads and parses until their slices.
- A whole-settings model, and any memo of parsed documents.
- Types of the reader's own: it returns `definition`'s parsed types.
- Calls in `check.go` to `definition` functions that do not parse a document (`ValidName` and the like).
- The `coupling` allow-list in `internal/archtest/formats_test.go`: it neither grows nor shrinks.

## Decisions

- The shape and the order of consumers are the advisor's ruling in run `20261012T211336Z-aea15b`.
- Recorded after implement run `20261012T213850Z-dfd86c`, which found criterion 2's first list too short to keep `check`'s report unchanged: the Checker reports the workspace settings' source, the path and layer of an unreadable document, and reads raw process documents to find bases. The reader serves those three. The function that names a process's base holds a once-per-base cache of its own; the reader holds none.
- `withDocument`, a decorator of the `definitions` port, moves out of `check.go` to a file of its own: it must call the port's `Read`, and it is the port, not a reader of documents for the Checker.

## Open

None.
