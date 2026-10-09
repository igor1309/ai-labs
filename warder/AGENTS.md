# AGENTS (warder)

The design is `docs/agent-monitoring-mvp.md`. Issues are in the Multica
project `warder` (parent LAB-135).

## Architecture: strict separation

`.agister/prompts/go-architecture.md` applies in full, with no exception
for convenience. In warder that means:

- Warder is one Go module, `github.com/igor1309/ai-labs/warder`
  (`warder/go.mod`). Each component of the design is one package under
  `warder/internal/` (for example `internal/jsonl`).
- A component package imports no other package of the module. It
  declares the interfaces it requires, with only the methods it calls,
  and its own types, including its own observation and agent types, even
  where another package has the same fields.
- `cmd/warder` is the only composition root, and only it imports the
  component packages. It constructs every implementation, and it owns the
  adapters that translate one component's types into another's and the
  boundary adapters (clock, timer, deadline, stdout, stderr, OS
  processes).
- Every constructor receives each collaborator explicitly; nothing falls
  back to a real clock, timer, writer or process. No package-level
  mutable state.
- The architecture test, `warder/arch_test.go`, keeps these rules for the
  whole module: the package graph from the real import graph, interfaces
  beside their consumers, and the test markers through gokit's
  `testdiscipline` (gokit at a tagged version, ADR-019). A new package is
  covered without an edit to it.

`.agister/prompts/go-testing-seams.md` applies to every test.

## Testing

From the repository root, quiet (never `-v`):

- The full check: `warder/scripts/test.sh`, which runs from `warder/`
  `test -z "$(gofmt -l .)"`, `go vet ./...` and
  `go test -race -count=1 -timeout 1m ./...`. CI runs the same script
  (`.github/workflows/warder-core.yml`, on the local Mac runner).
- Narrow it while working, from `warder/`:
  `go test -race -count=1 -timeout 1m ./internal/<name>/...`.
- `GOPRIVATE=github.com/igor1309/ai-labs` must be set: the module requires
  gokit from this private repository.

## Implementation and review

These replace the root `AGENTS.md`'s implementation and review steps; its
verification rules still apply. Use Agister's processes, never a direct
subagent or a direct `codex exec` review.

- Implement through `implement_warder`, whose verification is
  `warder/scripts/test.sh`, not the Agister check of `implement`. From the
  change's worktree, with the candidate committed and the brief in a file:
  `agister run implement_warder --param candidate=HEAD --param brief=<file>`.
- Verify the result yourself: `scripts/handoff-check.py --claimed <files>`,
  then `warder/scripts/test.sh`.
- Review the committed candidate with
  `agister run code_review --param base=<rev> --param candidate=HEAD --param goal=<file>`,
  and send fixes to a fresh `implement_warder` run with their own brief.
- A run refused because a runtime's version is not verified (for example
  `runtime mapping codex verifies no primitive for codex version …`) is a
  block, not something to work around. Verify the new version first, as
  the mapping's comments describe (`agister/home/runtimes/`), adopt it
  through `agister install agister/home`, then run the process. Never fall
  back to calling the runtime directly.
