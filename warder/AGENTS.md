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

- Build from `warder/`: `go build ./cmd/warder`.
- Command line: `warder [-verbose] -claude <source-id>`, `-claude`
  repeatable. Each enables one Claude Code source under that source ID.
  No source, an empty or duplicate ID, an ID that is not valid UTF-8, a
  `-verbose` that is not a boolean, an unknown flag or a stray argument is
  a usage error.
- Settings, constants in `cmd/warder/main.go`: a Claude source's read is
  limited to 5 seconds, and it waits 5 seconds after each attempt.
- stdout: one JSON line per successful read, the design's observation
  contract. Nothing else is written there. SIGPIPE is ignored: a stdout
  whose reader is gone is an output error, which exits 1.
- Shutdown: the design allows backpressure on stdout, so a first SIGINT or
  SIGTERM waits for a pending write to stdout; there is no interruptible
  output. Once the first signal has cancelled the run, both signals have
  their default behaviour again: a second SIGINT or SIGTERM ends a run
  held by a stdout consumer that stopped reading.
- stderr: one line per read that failed or timed out,
  `warder: <source-id>: <error>`, and warder's own messages,
  `warder: <error>`. With `-verbose`, also one `log/slog` text record per
  execution, read, capture, deadline, publish and wait, at `level=DEBUG`:
  `time=<clock time> level=DEBUG msg=<step> source=<source-id> [step's
  own attributes] outcome=ok|error [error=<error>] duration=<duration>`,
  the times from the injected clock. Records and diagnostics share one
  serialized writer, one Write per line. Without `-verbose` logging is
  off and stderr carries diagnostics only.
- Exit codes: 0 when SIGINT or SIGTERM cancelled the run, after every
  source loop returned; 1 for a failure it cannot recover from, as an
  output error is; 2 for a usage error, with nothing started.
