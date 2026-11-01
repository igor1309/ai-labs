# LAB-234: the reader gives the service settings in app's own type

## Intent

`internal/app/reader.go` is the one file of `app` that parses a settings document, but its `documentReader` still returns the parser's types, so every consumer in `app` names `definition`. LAB-188 goes inside-out: a component gets its own types and its callers map the file shape to them. This is the first kind: the service settings. The reader returns an `app`-owned value, and `definition.Service` is named in `reader.go` only. Behaviour does not change.

## Done when

1. `internal/app` declares an unexported type for the service settings as `app` uses them: the ceilings as `policy.Ceilings`, and the state-reaching primitives. It has no format tag, is no alias of a parser type, and repeats no field `policy.Ceilings` already carries.
2. `documentReader.Service` returns that type, with the document's source returned beside it as before. The mapping from `definition.Service` is in `reader.go` and nowhere else, and it also maps what parsed of a service whose parse failed.
3. No non-test file of `internal/app` other than `reader.go` names `definition.Service`: the Resolver's resolution, `parsedSettings` and the mapping to `settings.Service` use the new type, and the `definition.Service` mapper leaves `resolve.go`.
4. A failure to read and a failure to parse stay distinct, with the `*document.InvalidError`, the order of its problems, their unknown flags and the source's layers as before.
5. Committed tests prove: the reader's service value for a full service document, stated as independent expected values (every ceiling, the permission lists, the defaults, an absent optional cost); and, for a bad service document, the `*document.InvalidError`, the values that still parsed, and the layer each problem is attributed to.
6. A committed architecture test fails if a non-test file of `internal/app` other than `reader.go` names the parser's `Service` type, under any name the file imports `definition` by. It is proved on fixtures in a temp directory.
7. Every output, message, exit code and JSON of `agister` is unchanged; the existing tests pass unedited, except where a test names an unexported helper or type this change removes or replaces.
8. `scripts/test.sh` passes.

## Out of scope

- Every other kind of document: the reader still returns `definition`'s type for them.
- `settings.Service` and `policy.Ceilings` themselves: they are not changed, and `settings` is not grown to serve `app`'s consumers.
- `ValidName`, the session modes, `CallSkills`, formatting and the writer.
- Splitting `app`, or moving the reader or the parser.
- The `coupling` allow-list in `internal/archtest/formats_test.go`: it neither grows nor shrinks.

## Decisions

- The advisor's ruling in run `20261013T021809Z-2ac2f8`: no split of `app` now; the reader gets `app`-owned types, one kind per PR, the service first; the types live in `app`, not in `settings`.

## Open

None.
