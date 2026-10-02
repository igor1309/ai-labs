# Agister CLI

Runs agent calls, and workflows of them, whose agents, processes,
permissions and output contracts are settings, not code. The decisions are
in [docs/adr/](docs/adr/); start with
[ADR-001](docs/adr/001-agister-cli-architecture.md).

## Build and try

```bash
cd agister
go build -o bin/agister ./cmd/agister
bin/agister --help          # every command and option
bin/agister init            # example settings into ~/.agister
bin/agister check           # validate the settings
bin/agister run ask --param question="What does cmd/agister do?"
bin/agister runs show <run-id>
bin/agister pages           # a page of what the settings can run
```

`agister pages` serves a local page that shows the workflows and processes
a repository's settings can run and what they are made of:
[pages/README.md](pages/README.md).

## Settings

Global settings live in `~/.agister/` (`$AGISTER_HOME` or `--home`); a
repository's own `.agister/` takes priority, document by document. Every
command except `init` checks the composed settings first and stops on any
problem. Runs are recorded under `~/.agister/runs/<id>/`.

A process declares its verification command inline, or names a document
that holds it: `verify: verify:repo` is `verifies/repo.yaml`, found like any
other document, the repository's before the global one. So a process shared
by every repository carries no command, and each repository states its own
once. A process whose named verification exists in neither place is not a
problem of the settings: `check` warns, and only calls of that process are
refused ([ADR-010](docs/adr/010-a-process-names-its-verification.md)).

Agister is a runner, not a guard: running it in a repository applies that
repository's `.agister/`, including the commands its agents run. Review
settings you did not write.

`examples/settings/` is what `init` installs; `examples/codex/`,
`examples/pi/` and `examples/opencode/` are opt-in.

## Test

The commands are in [AGENTS.md](AGENTS.md). CI:
`.github/workflows/agister-core.yml`.

Known gaps: [docs/deferred.md](docs/deferred.md). Ideas:
[backlog/](backlog/README.md).
