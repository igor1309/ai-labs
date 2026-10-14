# LAB-236: the reader gives an agent in app's own type

## Intent

`internal/app/reader.go` is the one file of `app` that parses a settings document. LAB-188 goes inside-out: the reader returns `app`-owned types, one kind per PR, so that the consumers in `app` stop naming the parser. The service settings (LAB-234, `serviceSettings` in `internal/app/service.go`) and the runtime mapping (LAB-235, `runtimeMapping` in `internal/app/mapping.go`) are done. This is the third kind: an agent. Behaviour does not change.

## Done when

1. `internal/app` declares an unexported type for an agent as `app` uses it. It carries every value of an agent a consumer in `app` reads (its name, runtime, model, model family, effort, command and skills, as far as each is read) and nothing no consumer reads. It has no format tag and is no alias of a parser type.
2. `documentReader.Agent` returns that type, with the document's source returned beside it as before. The mapping from `definition.Agent` is in `reader.go` and nowhere else, and it also maps what parsed of an agent whose parse failed.
3. No non-test file of `internal/app` other than `reader.go` names `definition.Agent`: the Resolver's resolution, `parsedSettings`, the Checker, the lists, the snapshot's use of a parsed agent, the mapping to `settings.Agent` and create-agent use the new type.
4. Create-agent builds the agent it writes in the new type. Turning it into the bytes of a settings document (`definition.FormatAgent`) and validating those bytes are helpers in `reader.go`, so that create-agent names no parser type; what is written, byte for byte, is unchanged.
5. Where `agister` prints an agent as JSON, the output is unchanged, and no format tag is added to the new type for it: the output's shape belongs to the type that is printed, in `contract` or at the edge that prints it.
6. A failure to read and a failure to parse stay distinct, with the `*document.InvalidError`, the order of its problems, their unknown flags and the source's layers as before.
7. Committed tests prove the reader's value for a full agent document and for one with only the required fields, stated as independent expected values; for a bad agent document, the `*document.InvalidError` and the values that still parsed; and that the bytes create-agent writes for an agent are what they were.
8. The architecture test's `ownTypes` in `internal/archtest/formats_test.go` lists `Agent` too.
9. Every output, message, exit code and JSON of `agister` is unchanged; the existing tests pass unedited, except where a test names an unexported helper or type this change removes or replaces.
10. `scripts/test.sh` passes.

## Out of scope

- Every other kind of document: the reader still returns `definition`'s type for them.
- `settings.Agent` itself, and `definition.CallSkills`: the skills a call is given are computed where they are now, from the same values.
- The writer (LAB-227): where create-agent's bytes are written, and by what.
- Splitting `app`; moving the reader or the parser.
- The `coupling` allow-list in `internal/archtest/formats_test.go`: it neither grows nor shrinks.

## Decisions

- The advisor's ruling in run `20261013T021809Z-2ac2f8`: `app`-owned types, one kind per PR; the types live in `app`, not in `settings`, because `settings.Agent` omits the model, the command and other values `app` uses.

## Open

None.
