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
repository's own `.agister/` takes priority, document by document. Commands
check the composed settings before use. A problem refuses
only what uses the document it is in: a call whose process, agent, runtime
mapping, policy, schema or named verification is broken is refused before
its first turn and recorded, and a workflow with such a node is refused
before any node runs; everything else keeps running. Only broken service
settings, a file name that is not a name, a settings directory that cannot
be listed, or a workflow named like a process stop every command except
`init`, `check`, cancelling a run and following an admitted run. `check`
reports every problem and says what each refuses. Runs are recorded under
`~/.agister/runs/<id>/`.

Listings and shows display refused items. An agent selected with `--agent`
is checked in place of the process's default agent. A write is refused if
it adds a problem; existing document problems do not stop it.

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

A process with `workspace.checkout` runs in a fresh worktree, which holds
only what the repository tracks. `workspace.setup` prepares it before the
agent's first turn ([ADR-012](docs/adr/012-a-checkout-runs-its-setup.md)):
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

To continue a run of such a process, run from the repository the checkout
is of, and pin its revision param: a default like `HEAD` resolves in the
directory you launch from. `--continue <run-id>` resumes the run's session
and carries the session's latest run's `changes.patch` into the new checkout,
uncommitted, on the same revision
([ADR-013](docs/adr/013-a-continuation-carries-the-earlier-runs-changes.md)).
Whichever run of the session you name, its latest run's changes are
carried. A finished run's changes are
`~/.agister/runs/<id>/artifacts/changes.patch`, applied with `git apply`.

`examples/settings/` is what `init` installs; `examples/codex/`,
`examples/pi/` and `examples/opencode/` are opt-in.

## Test

The commands are in [AGENTS.md](AGENTS.md). CI:
`.github/workflows/agister-core.yml`.

Known gaps: [docs/deferred.md](docs/deferred.md). Ideas:
[backlog/](backlog/README.md).
