# LAB-239: the reader gives a process and a verification in app's own types

## Intent

`internal/app/reader.go` is the one file of `app` that parses a settings document. LAB-188 goes inside-out: the reader returns `app`-owned types, so that the consumers in `app` stop naming the parser. Done so far: the service settings, the runtime mapping, the agent, the prompt, the brief form, the skill, and the workflow with its nodes, params and input values, each a type in a file of its own in `internal/app` with its mapper in `reader.go`. This slice takes the last and largest kind: a process, and with it a verification, because a process holds its verification, inline or by name. Behaviour does not change.

## Done when

1. `internal/app` declares unexported types for a process, a verification and the verify values (command, timeout, attempts, instruction) as `app` uses them. Each carries every value a consumer in `app` reads and nothing no consumer reads, has no format tag and is no alias of a parser type. A process's params and input values are the `declaredParam` and `declaredValue` of `internal/app/declared_inputs.go`; its own limits are `policy.Declared`.
2. `documentReader.Process` and `documentReader.Verification` return those types, with the document's source returned beside each as before; so does the parsing of a process document already read (the snapshot's use). The mappings from the parser's types are in `reader.go` and nowhere else, and each also maps what parsed of a document whose parse failed.
3. No non-test file of `internal/app` other than `reader.go` names `definition.Process`, `definition.Verification`, `definition.Verify`, `definition.Output` or `definition.Limits`. The temporary mappers `processParams` and `processValues` in `reader.go` are gone.
4. Whether a call's session may be resumed is a value of the process type, decided once where the process is mapped: a process that sets no session is fresh-only (ADR-030 rules 2 and 3). No consumer in `app` names `definition.CallSession`, `definition.SessionFresh` or `definition.SessionResumable`; where a session mode is recorded or printed as text, the text is unchanged.
5. The process's other semantic helpers a consumer uses (what it collects, its forms, its prompts, whether its verification repairs, and any other method of the parser's process or verify) keep their behaviour: each moves with the type if it reads nothing of the format, else is reached through a helper in `reader.go`. "Each form once, in declaration order" has one implementation for a process and a workflow.
6. The resolving of a process with the verification it names (`parsedSettings.resolved`, and the Resolver's own) gives the same verify values as before, and a process that names a verification the settings lack is as before.
7. A failure to read and a failure to parse stay distinct, with the `*document.InvalidError`, the order of its problems, their unknown flags and the source's layers as before. Obsolete-field warnings of a process and of a verification reach `check` as before.
8. Committed tests prove the reader's value for a full process document and for one with only the required fields, and for a verification, stated as independent expected values; for a bad document of each kind, the `*document.InvalidError` and the values that still parsed; and that a process that sets no session is fresh-only while one that says resumable is resumable.
9. The architecture test's `ownTypes` in `internal/archtest/formats_test.go` lists `Process`, `Verification`, `Verify`, `Output` and `Limits` too.
10. Every output, message, exit code and JSON of `agister` is unchanged; the existing tests pass unedited, except where a test names an unexported helper or type this change removes or replaces.
11. `scripts/test.sh` passes.

## Out of scope

- The blocks, and the parser's functions that are not about a parsed process: `ValidName`, `WithHome`, `NewExtender`, `ObsoleteWorkspace`, `FormatAgent`, `CallSkills`, `Value.Bind`.
- The input source names and input names of the parser (`CollectionSource`, `PromptSource`, `PromptInput`, `GuidanceInput`): they stay the parser's constants in this slice, named where they are named now.
- `settings.Process`, `policy.Declared` and `run`'s types themselves.
- The writer; splitting `app`; moving the reader or the parser.
- The `coupling` allow-list in `internal/archtest/formats_test.go`: it neither grows nor shrinks.

## Decisions

- The advisor's ruling in run `20261013T021809Z-2ac2f8`: `app`-owned types, living in `app`; semantic helpers are handled alongside their consuming kind, preserving fresh-only defaults and process-owned resume eligibility.
- The process and the verification go in one slice: a process holds its verification, so either alone would need a mapper back to the parser's type.

## Open

None.
