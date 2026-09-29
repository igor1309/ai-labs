# Agister CLI

Runs **agent calls** whose agents, processes, permissions and output
contracts are settings, not code. Architecture: [ADR-001](docs/adr/001-agister-cli-architecture.md).

## Build and try

```bash
cd agister
go build -o bin/agister ./cmd/agister

bin/agister --help                # every command and option; needs no settings

bin/agister init                  # example settings into ~/.agister ($AGISTER_HOME or --home);
                                  # shows what it writes and asks you to type "yes"
                                  # (--force also replaces existing files; scripts: echo yes | ...)
bin/agister check                 # validate all settings; report discovered problems
bin/agister check --probe         # also ask each agent's runtime for its version
bin/agister check --tree          # what defines what: each process, what it uses, which file
                                  # (global or project, and what it overrides), unused definitions
bin/agister check --json          # the whole report, including that graph, as JSON

bin/agister agent list
bin/agister agent create reviewer --runtime claude-code --model opus --model-family anthropic --force
                                  # --force replaces an existing agent after you type "yes";
                                  # creating a new one asks nothing; an agent that would make
                                  # the settings fail check is refused before anything is written

bin/agister process list
bin/agister process show adversarial_review
bin/agister run adversarial_review --param base=main
bin/agister run ask --param question="What does cmd/agister do?"
bin/agister run ask --continue <run-id> --param question="And cmd/agister/main_test.go?"
bin/agister run ask --max-cost 0.25 --json       # print the node result as JSON

bin/agister runs
bin/agister runs show <run-id>
bin/agister runs watch <run-id> --after <seq>
```

Every call ends in a **node result**, the same shape any future node will
have: `status` (`completed`, `failed`, `interrupted`, `lost`), an error
`class` when not completed (`refused`, `invalid_output`, `budget_exhausted`,
`rate_limited`, `timeout`, …), `output`, `usage`, `cost` with its source,
`timing`, `artifacts` (changes made in a checkout) and `session`. A verdict
in the output is output: routing on it is the caller's job.

Exit codes: `0` completed, `1` failed, `2` interrupted, `3` refused, `4` lost, `64` usage or invalid settings, `70` internal error, `130` stopped watching.

## Settings

```text
~/.agister/
  service.toml  agents/*.toml  processes/*.yaml  policies/*.yaml
  runtimes/*.yaml  schemas/*.json      settings (validated by `check`)
  runs/<id>/  record.json events.jsonl provider.jsonl artifacts/
  logs/  provenance/                  evidence and diagnostics
```

A repository can keep its own settings in `<repository root>/.agister/`, the
same way it keeps `.claude/` or `.agents/`, and so can any branch of it. They
apply wherever Agister runs inside that repository, and take priority over
global settings document by document: a project `agents/reviewer.toml`
replaces the global one, for any kind of setting, unconditionally: a project
may set anything, looser or tighter than the global settings. What is checked
is that the result composes. `agister check` verifies the composed
settings (references, limits composing service ⊇ policy ⊇ process,
enforcement on each runtime) and lists every override, and every call
re-verifies what it uses. `process show` and run records name each
definition's file and the global one it overrides. With `--debug`, Agister
says why no project settings apply; a `.agister` that is not a usable
directory fails the command. `init` and `agent create` write global
settings.

```text
<repository>/.agister/
  service.toml  agents/*.toml  processes/*.yaml  policies/*.yaml
  runtimes/*.yaml  schemas/*.json     same layout, higher priority
```

Nothing works on settings that do not compose. The client itself
(`app.Gated`, so any client of the contract, not only the CLI) runs `check`
(without `--probe`) before every use and refuses with the report on any
problem: the CLI prints it and exits 64. `init` is exempt because it writes
the settings, and `--help` needs none. Cancelling a run is never refused,
and a run already started stays observable, so editing settings mid-run
cannot strand it. Passing is silent. Each gated operation reads the settings
once and checks that snapshot, then uses the same snapshot, so an edit landing
in between changes neither. Every call also re-validates what it uses and refuses
before the provider turn starts.

`init` and `agent create --force` overwrite files, so each first lists what
it would write and waits for you to type `yes`; any other answer writes
nothing. "yes" approves the plan that was shown: a file changed while you
were asked is not overwritten, and nothing more is written. Scripts pipe
the answer: `echo yes | agister init`.

Agister is a runner, not a guard. The settings are yours, and so is judging
them: Agister does not decide whether they are right, safe, trusted, too
expensive or too constrained for the task, and a project's settings are as
authoritative as your global ones. Running Agister in a repository applies
that repository's `.agister/`, including the commands its agents name, much
as running its `Makefile` would, and an agent allowed to write the
repository can change those settings for later calls. Review settings you
did not write before you run them.

Agister does not handle settings edited concurrently with its own writes or
calls. It serializes its own writes and gives each operation one consistent
read, but anything else changing the files at the same moment is yours to
avoid. That includes you, an editor, a sync, a `git pull` or an agent. An
edit landing while `init` or `agent create` writes can be lost, and a call
that starts while `init --force` is replacing files can see some old files
and some new ones.

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

CI: `.github/workflows/agister-core.yml`, invoked from `ci.yml` for Agister
Go, module and example changes, selected policy changes, or CI workflow changes.
Documentation-only changes do not trigger it.

Known gaps and their triggers: [docs/deferred.md](docs/deferred.md). Ideas not yet planned: [backlog/](backlog/README.md). Live observations: [docs/findings.md](docs/findings.md).
