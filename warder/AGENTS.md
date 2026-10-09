# AGENTS (warder)

The design is `docs/agent-monitoring-mvp.md`. Issues are in the Multica
project `warder` (parent LAB-135).

## Architecture: strict separation

`.agister/prompts/go-architecture.md` applies in full, with no exception
for convenience. In warder that means:

- Each component of the design is its own Go module under `warder/`, with
  module path `github.com/igor1309/ai-labs/warder/<name>`.
- A component module imports no other warder module. It declares the
  interfaces it requires, with only the methods it calls, and its own
  types, including its own observation and agent types, even where
  another module has the same fields.
- Only the composition root, `cmd/warder`, requires the component
  modules. It constructs every implementation, and it owns the adapters
  that translate one module's types into another's and the boundary
  adapters (clock, timer, deadline, stdout, stderr, OS processes).
- Every constructor receives each collaborator explicitly; nothing falls
  back to a real clock, timer, writer or process. No package-level
  mutable state.
- Each module keeps its own import rules by a test over its import graph.

`.agister/prompts/go-testing-seams.md` applies to every test.

## Testing

From the repository root, quiet (never `-v`):

- One module, from its directory:
  `test -z "$(gofmt -l .)" && go vet ./... && go test -race -count=1 -timeout 1m ./...`
- The full check, every module: `warder/scripts/test.sh`. CI runs the same
  script (`.github/workflows/warder-core.yml`, on the local Mac runner).

## Implementation

Implement through Agister's `implement_warder` process, whose
verification is `warder/scripts/test.sh`, not the Agister check of
`implement`. From the change's worktree, with the candidate committed and
the brief in a file:
`agister run implement_warder --param candidate=HEAD --param brief=<file>`.
The root `AGENTS.md` rules for verifying and reviewing still apply.
