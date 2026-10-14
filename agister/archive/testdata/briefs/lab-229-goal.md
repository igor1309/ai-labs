# LAB-229: the document vocabulary is the core's, not the parser's

## Intent

This is step 3a of LAB-188, the first slice of the app step. How settings are kept, in files and their formats, belongs to the outer edges only (LAB-186). `internal/domain/definition` parses the settings files and is an edge.

`internal/app` uses `definition` about 330 times. Most uses are vocabulary: which document something is (`Kind*`), where it came from (`Source`, `Layer*`) and the document itself (`Document`). That vocabulary is a core concept that sits in the parser's package. The use cases that only move documents (install, retire, the gate) never parse, yet import the parser for it. This step moves the vocabulary to the core. The parsing stays where it is; the settings loader (LAB-226) is the next step.

## Done when

1. A new package `internal/domain/document` holds the document vocabulary, moved from `internal/domain/definition` with its doc comments and methods:
   - `Kind`, its constants and `Singular`;
   - `Layer` and its constants;
   - `Source` and `Attribute`;
   - `LayerFile`, `LayerText`, `LayerDir`, `LayerProblem`;
   - `Document`, `ErrNotFound`, `Composed`;
   - a document's problems: `InvalidError` with its methods, and `Problem`.

   It imports no format library, no file system and no `definition`. The tests of what moved move with it.
2. `definition` imports `document` and keeps none of these names: no type alias, no re-exported constant, no forwarding function. Every user in the module names `document`: `internal/app`, `internal/adapters`, `internal/cli`, `internal/composition`, `cmd`, `pages` and their tests.
3. These `internal/app` files import no `definition`: `install.go`, `retire.go`, `gate.go` and `reach.go`. A file that still parses, or uses a parsed type, keeps its import.
4. `internal/archtest` passes. The LAB-190 allow-list in `formats_test.go` gains no entry and loses none: `internal/app` still imports `definition` for parsing.
5. Behaviour is unchanged. Every message, every `--json` output and every record stays byte for byte as it is. The existing tests pass, changed only in the package they name.

## Out of scope

- The parsed types (`Process`, `Agent`, `Mapping`, `Workflow`, `Service`, `Verify` and the rest), the `Parse*` functions, the session modes and the input source names (`CollectionSource`, `FileSource`, `PromptSource`). They move with the settings loader (LAB-226).
- `ValidName` and `tabled`. They stay in `definition`.
- The values of the `Kind` constants, which are the settings folders' names. They stay as they are.
- Splitting `internal/app`.

## Decisions

- 2026-10-12, the owner: the app step goes in slices, vocabulary first. Then one settings loader (LAB-226), then the decision on splitting `app`, then the writer (LAB-227).

## Open

None.
