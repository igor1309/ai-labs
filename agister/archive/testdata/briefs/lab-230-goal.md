# LAB-230: app reads a settings document through one typed reader; the Resolver first

## Intent

Four places in `internal/app` read a settings document through the `definitions` port and call `definition.Parse*` on it themselves: check, resolve, the lists and inspect, and the snapshot. LAB-188 wants that knowledge in one place, so the parser can later move behind one edge component. This is the first of four slices: the reader exists, and the Resolver reads through it. Behaviour does not change.

## Done when

1. `internal/app` has one typed reader over the `definitions` port. It has one method per kind of document the Resolver reads (the service, a process, an agent, a runtime mapping, a verification, a prompt, a brief form, a skill, a workflow). Each method reads the document, parses it and returns the parsed value with the document's source.
2. `internal/app/resolve.go` calls no `definition.Parse*` function and reads no document from the `definitions` port directly: every document a call or a workflow resolves comes through the reader.
3. The reader decides nothing for its caller. Traversal order, stopping at the first failure, partial resolution, the refusal wording and the recording of sources stay in the Resolver.
4. A failure to read and a failure to parse stay distinct to the caller, and a parse failure keeps its `*document.InvalidError` and the document's source. A committed test with a fake `definitions` port proves both for the reader.
5. A committed test with a spy `definitions` port proves the Resolver reads no further document after the first that fails.
6. Every refusal, message, exit code and JSON output of `agister` is unchanged; the existing tests pass unedited, except where a test names an unexported helper this change removes.
7. `scripts/test.sh` passes.

## Out of scope

- `check.go`, `definitions.go` and `snapshot.go`: they keep their own reads and parses until their slices.
- A whole-settings model, and any memo of parsed documents.
- Types of the reader's own: it returns `definition`'s parsed types. The reader's boundary and types come when it moves to the edge.
- Moving the parser, the session modes or the input source names out of `definition`.
- The `coupling` allow-list in `internal/archtest/formats_test.go`: it neither grows nor shrinks.

## Decisions

- The shape is the advisor's ruling in run `20261012T211336Z-aea15b`: a typed reader, one document at a time, inside `app`. A call depends on what it resolves (ADR-015 rule 1), so the reader reads only what it is asked for.

## Open

None.
