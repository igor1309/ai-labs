# AGENTS (warder)

The design is `docs/agent-monitoring-mvp.md`. Issues are in the Multica
project `warder` (parent LAB-135).

## Architecture: strict separation

`.agister/prompts/go-architecture.md` applies in full, with no exception
for convenience. In warder that means:

- Warder is one Go module, `github.com/igor1309/ai-labs/warder`
  (`warder/go.mod`). Each component of the design is one package under
  `warder/internal/` (for example `internal/jsonl`). Every package is the
  module root (the architecture test's own), under `internal/` or under
  `cmd/`.
- Logging is a decorator the composition root wraps around a collaborator
  (`cmd/warder/logging.go`): it implements the interface of what it wraps
  without naming it, changes no argument, result or error, and logs
  through the one `*slog.Logger` `wire` is given. Logging never goes
  inside `internal/`: no component imports `log/slog` or knows it is
  logged.
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
  whole module: where each package is and the package graph, from the
  real import graph; interfaces beside their consumers, every type whose
  resolved type is an interface (aliases and types defined over one
  included); and the test markers through gokit's
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

## Running

`README.md` is for whoever runs warder: how to build it, the command line
and its usage errors, the settings, stdout, stderr and the `-verbose`
records, shutdown and the exit codes.

- That behaviour is the contract the code and its tests keep. A change to
  it changes `README.md` in the same change, and every claim there
  matches the code.
- In the code a record's time and duration come from the injected clock,
  never from `log/slog`'s own.
