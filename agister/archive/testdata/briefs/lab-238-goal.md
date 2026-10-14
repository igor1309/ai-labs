# LAB-238: the reader gives a workflow, with its params and input values, in app's own types

## Intent

`internal/app/reader.go` is the one file of `app` that parses a settings document. LAB-188 goes inside-out: the reader returns `app`-owned types, so that the consumers in `app` stop naming the parser. Done so far: the service settings, the runtime mapping, the agent, the prompt, the brief form and the skill, each a type in a file of its own in `internal/app` with its mapper in `reader.go`. This slice takes a workflow: the workflow itself, its nodes, and the params and input values it declares. A process declares params and input values of the same parser types; the process is the next slice. Behaviour does not change.

## Done when

1. `internal/app` declares unexported types for a workflow, a node, a declared param and a declared input value, as `app` uses them. Each carries every value a consumer in `app` reads and nothing no consumer reads, has no format tag and is no alias of a parser type.
2. `documentReader.Workflow` returns the workflow type, with the document's source returned beside it as before. The mapping from the parser's types is in `reader.go` and nowhere else, and it also maps what parsed of a workflow whose parse failed.
3. No non-test file of `internal/app` other than `reader.go` names `definition.Workflow`, `definition.Node`, `definition.Param` or `definition.Value`. The consumers that take params or input values of a workflow and of a process alike (the call's and inspect's params and values, the mapping to `settings`) take the new types; a process's params and values, still the parser's inside `definition.Process`, reach them through mappers in `reader.go`.
4. The binding of an input value's arguments to params and earlier values (`definition.Value.Bind`) keeps its behaviour: one pass, the same references, the same refusals. It is reached through a helper in `reader.go`, or it moves with the type if it reads nothing of the format; a committed test proves that references are bound in one pass.
5. Methods of the parser's workflow a consumer uses (its nodes in order, and any other) keep their behaviour, by the same rule as criterion 4.
6. A failure to read and a failure to parse stay distinct, with the `*document.InvalidError`, the order of its problems, their unknown flags and the source's layers as before.
7. Committed tests prove the reader's value for a workflow that fans out and joins and for a workflow of one call, stated as independent expected values (params with and without a default, input values with their source, arguments and forms, nodes with process and agent), and, for a bad workflow document, the `*document.InvalidError` and the values that still parsed.
8. The architecture test's `ownTypes` in `internal/archtest/formats_test.go` lists `Workflow`, `Node`, `Param` and `Value` too.
9. Every output, message, exit code and JSON of `agister` is unchanged; the existing tests pass unedited, except where a test names an unexported helper or type this change removes or replaces.
10. `scripts/test.sh` passes.

## Out of scope

- The process, the verification and the blocks: the reader still returns `definition`'s type for them.
- The input source names of the parser (`definition.CollectionSource` and the others): constants, not parsed types; they go with the process.
- `settings.Workflow`, `settings.Node`, `settings.Value` and `settings.Param` themselves.
- The writer; splitting `app`; moving the reader or the parser.
- The `coupling` allow-list in `internal/archtest/formats_test.go`: it neither grows nor shrinks.

## Decisions

- The advisor's ruling in run `20261013T021809Z-2ac2f8`: `app`-owned types, living in `app`; semantic helpers are handled alongside their consuming kind, and one-pass input binding is preserved and proved.

## Open

None.
