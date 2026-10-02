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

Agister is a runner, not a guard: running it in a repository applies that
repository's `.agister/`, including the commands its agents run. Review
settings you did not write.

A process with `workspace.checkout` runs in a fresh worktree, which holds
only what the repository tracks. `workspace.setup` prepares it before the
agent's first turn ([ADR-010](docs/adr/010-a-checkout-runs-its-setup.md)):
a command run with your authority in the checkout, once per call. Both
fields are required. What it makes must be ignored by git; if it fails, runs
out of time or changes the checkout's content, the call fails before any
turn. An optional `workspace.yaml` (global or repository, the repository's
first) gives the setup for every process with a checkout and none of its
own:

```yaml
# .agister/workspace.yaml
# schema: agister.workspace/v1alpha1
# setup:
#   command: ln -s ../config/local.json config/local.json
#   timeout: 1m
```

`examples/settings/` is what `init` installs; `examples/codex/`,
`examples/pi/` and `examples/opencode/` are opt-in.

## Test

The commands are in [AGENTS.md](AGENTS.md). CI:
`.github/workflows/agister-core.yml`.

Known gaps: [docs/deferred.md](docs/deferred.md). Ideas:
[backlog/](backlog/README.md).
