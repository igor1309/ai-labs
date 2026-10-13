# LAB-250: the input vocabulary has a core home in input

## Intent

Five constants name the inputs and input sources that a process, a workflow and a run record share: `PromptInput`, `GuidanceInput`, `PromptSource`, `CollectionSource` and `FileSource`. They are core vocabulary, not a parsing concern. Today they live in the parser package `internal/domain/definition` (`prompts.go`, `workflow.go`, `briefs.go`), and `app` re-declares local names for some of them in `reader.go`. Slice 2 of LAB-226 (advisor run `20261013T065554Z-1701f1`) moves them to a new package, `internal/domain/input`, so that the reader's later move to the edge does not carry them with it. Behaviour does not change.

## Done when

1. The five constants are declared in `internal/domain/input`, with the same values and their doc comments.
2. `internal/domain/definition` declares none of them, and no constant, variable or alias that forwards to one. Every caller (the parser, the adapters, `cmd` and `app`) names `input.<Name>` directly.
3. `app`'s local names for these constants in `reader.go` (such as `promptSource` and `collectionSource`) are gone. Their uses in `app` name `input.<Name>` directly.
4. A committed test, `TestInputVocabularyKeepsRecordedNames`, in `internal/domain/input`, asserts each constant's value. Those values are written in settings files and run records.
5. The existing `TestAnInputValuesArgumentsAreBoundInOnePass` (`internal/app/reader_internal_test.go`) keeps passing. It is edited only where it names a moved constant.
6. A committed test, `TestTheParserDeclaresNoneOfTheInputVocabulary`, in `internal/archtest`, fails if `definition` declares any of the five names, or a constant, variable or alias whose value is one of them, taken from `input`. It is proved with `t.TempDir` fixtures: one that declares a moved name, one that forwards a moved constant, and one clean package that passes.
7. Every output, message, exit code and JSON of `agister` is unchanged. The existing tests pass, edited only where they name a moved constant.
8. `scripts/test.sh` passes.

## Out of scope

- The filesystem seam (slice 3) and every other LAB-226 slice.
- Changing any input's name or value.

## Decisions

- The advisor's ruling in run `20261013T065554Z-1701f1`: the input names move to a new `internal/domain/input`, with no forwarding declarations left in `definition`.
- As LAB-245's reviews ruled for `ValidName`, `app` keeps no local forwarders of moved vocabulary.

## Open

None.
