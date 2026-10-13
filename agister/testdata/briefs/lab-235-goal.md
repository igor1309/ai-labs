# LAB-235: the reader gives a runtime mapping in app's own type

## Intent

`internal/app/reader.go` is the one file of `app` that parses a settings document. LAB-188 goes inside-out: the reader returns `app`-owned types, one kind per PR, so that the consumers in `app` stop naming the parser. The service settings were first (LAB-234, `serviceSettings` in `internal/app/service.go`). This is the second kind: a runtime mapping. Behaviour does not change.

## Done when

1. `internal/app` declares an unexported type for a runtime mapping as `app` uses it: its name, its adapter, the efforts it supports, and what it offers as `enforce.Offer`. It has no format tag, is no alias of a parser type, and carries nothing no consumer in `app` reads.
2. `documentReader.Mapping` returns that type, with the document's source returned beside it as before. The mapping from `definition.Mapping` is in `reader.go` and nowhere else, and it also maps what parsed of a mapping whose parse failed.
3. No non-test file of `internal/app` other than `reader.go` names `definition.Mapping`: the Resolver's resolution, `parsedSettings`, the Checker, create-agent and the mapping to `settings.Mapping` use the new type, and the `offer(definition.Mapping)` mapper leaves `resolve.go` for `reader.go` or goes.
4. A failure to read and a failure to parse stay distinct, with the `*document.InvalidError`, the order of its problems, their unknown flags and the source's layers as before.
5. Committed tests prove the reader's value for a full mapping document, stated as independent expected values (name, adapter, efforts, and the offer: its selection rule and each primitive with its versions), and, for a bad mapping document, the `*document.InvalidError` and the values that still parsed.
6. The architecture test that keeps the parser's `Service` type out of every file of `app` but `reader.go` (`ownTypes` in `internal/archtest/formats_test.go`) covers `Mapping` too.
7. Every output, message, exit code and JSON of `agister` is unchanged; the existing tests pass unedited, except where a test names an unexported helper or type this change removes or replaces.
8. `scripts/test.sh` passes.

## Out of scope

- Every other kind of document: the reader still returns `definition`'s type for them.
- `settings.Mapping` and `enforce.Offer` themselves: they are not changed.
- Formatting and the writer; splitting `app`; moving the reader or the parser.
- The `coupling` allow-list in `internal/archtest/formats_test.go`: it neither grows nor shrinks.

## Decisions

- The advisor's ruling in run `20261013T021809Z-2ac2f8`: `app`-owned types, one kind per PR; the types live in `app`, not in `settings`.

## Open

None.
