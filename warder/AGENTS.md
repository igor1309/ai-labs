# AGENTS (warder)

The design is `docs/agent-monitoring-mvp.md`. Issues are in the Multica
project `warder`, in the `ai-labs` workspace (parent LAB-135).

- One Go module; each component is one package under `internal/`, and
  `cmd/warder` is the only composition root. `arch_test.go` keeps the
  package graph and the interface and test rules.
- Logging is the decorators in `cmd/warder/logging.go`; nothing under
  `internal/` logs.
- The full check is `warder/scripts/test.sh` (CI runs the same). Narrow it
  while working, from `warder/`:
  `go test -race -count=1 -timeout 1m ./internal/<name>/...`.
- `GOPRIVATE=github.com/igor1309/ai-labs` must be set: the module requires
  gokit from this private repository.
