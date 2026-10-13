# LAB-245: ValidName has a core home in document

## Intent

`ValidName` decides which names a settings document may carry. It is core vocabulary, not a parsing concern, but it lives in the parser package `internal/domain/definition`, and `app` reaches it through a helper in `reader.go`. Slice 1 of LAB-226 (advisor run `20261013T065554Z-1701f1`) moves it to `internal/domain/document`, where the document vocabulary lives, so that the reader's move to the edge does not carry a core rule with it. Behaviour does not change.

## Done when

1. `ValidName` is declared in `internal/domain/document`, with the same accepted names and the same result for every input.
2. `internal/domain/definition` declares no `ValidName`, and no alias, wrapper or variable forwards to it. Every caller (the parser, the adapters and `app`) names `document.ValidName`.
3. `app`'s helper for `ValidName` in `reader.go` is gone. Its callers in `app` call `document.ValidName` directly.
4. A committed test, `TestValidNameKeepsTheExistingAcceptedNames`, in `internal/domain/document`, is table-driven over accepted names and invalid ones. It covers the empty name, the edge characters, a path separator and a dot-leading name, whatever the current rule accepts or refuses.
5. `TestTheParserDeclaresNoneOfTheDocumentVocabulary` in `internal/archtest` also fails if the parser declares `ValidName` or a forwarder to it. It keeps its `t.TempDir` fixture proof, extended with a fixture that declares one.
6. Every output, message, exit code and JSON of `agister` is unchanged. The existing tests pass, edited only where they name `definition.ValidName`.
7. `scripts/test.sh` passes.

## Out of scope

- The input vocabulary (slice 2) and every other LAB-226 slice.
- Changing what a valid name is.

## Decisions

- The advisor's ruling in run `20261013T065554Z-1701f1`: `ValidName` moves to `internal/domain/document`, with no forwarding declarations left in `definition`.

## Open

None.
