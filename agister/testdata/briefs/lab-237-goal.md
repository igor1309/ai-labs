# LAB-237: the reader gives a prompt, a brief form and a skill in app's own types

## Intent

`internal/app/reader.go` is the one file of `app` that parses a settings document. LAB-188 goes inside-out: the reader returns `app`-owned types, so that the consumers in `app` stop naming the parser. The service settings (`serviceSettings`, `service.go`), the runtime mapping (`runtimeMapping`, `mapping.go`) and the agent (`agentProfile`, `agent.go`) are done. This slice takes the three text documents a call is given: a prompt, a brief form and a skill. Each is a few fields, and all three are read by the Resolver and used by the call built from its resolution. Behaviour does not change.

## Done when

1. `internal/app` declares an unexported type for each of a prompt, a brief form (with its parts) and a skill, as `app` uses them. Each carries every value a consumer in `app` reads and nothing no consumer reads, has no format tag and is no alias of a parser type.
2. `documentReader.Prompt`, `ListedPrompt`, `Brief` and `Skill` return those types, with the document's source returned beside each as before. The mappings from the parser's types are in `reader.go` and nowhere else, and each also maps what parsed of a document whose parse failed.
3. No non-test file of `internal/app` other than `reader.go` names `definition.Prompt`, `definition.Brief`, `definition.BriefPart` or `definition.Skill`: the Resolver's resolutions and the building of a call's prompts, forms and skills use the new types.
4. Where a consumer passes one of these values to a function or method of the parser (checking a brief against its form, or another), the behaviour is kept: it is called through a helper in `reader.go`, or it moves with the type if it reads nothing of the format.
5. A failure to read and a failure to parse stay distinct, with the `*document.InvalidError`, the order of its problems, their unknown flags and the source's layers as before.
6. Committed tests prove the reader's value for a document of each of the three kinds, stated as independent expected values, and, for a bad document of each kind that can be bad, the `*document.InvalidError` and the values that still parsed.
7. The architecture test's `ownTypes` in `internal/archtest/formats_test.go` lists `Prompt`, `Brief`, `BriefPart` and `Skill` too.
8. Every output, message, exit code and JSON of `agister` is unchanged; the existing tests pass unedited, except where a test names an unexported helper or type this change removes or replaces.
9. `scripts/test.sh` passes.

## Out of scope

- The verification, the workflow, the process and the blocks: the reader still returns `definition`'s type for them.
- The input source names and input names of the parser (`definition.PromptSource`, `definition.PromptInput`, `definition.GuidanceInput`): they are constants, not parsed types, and go with the process.
- The writer; splitting `app`; moving the reader or the parser.
- The `coupling` allow-list in `internal/archtest/formats_test.go`: it neither grows nor shrinks.

## Decisions

- The advisor's ruling in run `20261013T021809Z-2ac2f8`: `app`-owned types, living in `app`. It asked for one kind per PR; the orchestrator takes these three together because each is a few fields and they share their two consumers.

## Open

None.
