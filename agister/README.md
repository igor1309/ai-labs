# Agister CLI

Runs **agent calls** whose agents, processes, permissions and output
contracts are settings, not code. Architecture: [ADR-001](docs/adr/001-agister-cli-architecture.md).

## Build and try

```bash
cd agister
go build -o bin/agister ./cmd/agister

bin/agister init                  # example settings into ~/.agister ($AGISTER_HOME or --home)
bin/agister check                 # validate all settings; lists every problem
bin/agister check --probe         # also ask each agent's runtime for its version

bin/agister process list
bin/agister process show adversarial_review
bin/agister run adversarial_review --param base=main
bin/agister run ask --param question="What does cmd/agister do?"

bin/agister runs
bin/agister runs show <run-id>
bin/agister runs watch <run-id> --after <seq>
```

Exit codes: `0` accepted, `1` rejected, `2` failed, `3` refused, `4` lost, `64` usage or invalid settings.

## Settings

```text
~/.agister/
  service.toml  agents/*.toml  processes/*.yaml  policies/*.yaml
  runtimes/*.yaml  schemas/*.json      settings (validated by `check`)
  runs/  logs/  provenance/            evidence and diagnostics
```

Every call re-validates what it uses and refuses before any runtime starts.
`examples/settings/` is what `init` installs. `examples/codex/` is opt-in;
see its README.

## Test

```bash
cd agister
gofmt -l .                                  # must print nothing
go vet ./...
go test -race ./...                         # everything; ~5 s
go test ./internal/app/...                  # use cases against spies
go test -coverpkg=./internal/...,./cmd/... -coverprofile=cover.out ./... && go tool cover -func=cover.out | tail -1
```

| Level | Where | Doubles |
|---|---|---|
| Domain rules | `internal/domain/*` | none (pure) |
| Use cases | `internal/app` | spies on every port: payloads asserted, responses scripted |
| CLI | `internal/cli` | spy client |
| Adapters | `internal/adapters/*` | real files, git, subprocesses; fake runtime binaries |
| Runtime conformance | `runtimetest.Conformance` | same suite for every runner and decorator |
| Wiring | `cmd/agister` | real composition root, fake runtimes |
| Architecture | `internal/archtest` | dependency rules, no kind of work in code |

CI: `.github/workflows/agister-core.yml`, run from `ci.yml` on changes under `agister/`.
