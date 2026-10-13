# Agister CLI

Runs agent calls, and workflows of them, whose agents, processes,
permissions and output contracts are settings, not code. The decisions are
in [docs/adr/](docs/adr/); start with
[ADR-001](docs/adr/001-agister-cli-architecture.md).

- [ADR-037: A nested worktree writer does not block the outer](docs/adr/037-a-nested-worktree-writer-does-not-block-the-outer.md).

## Build and try

```bash
cd agister
go build -o bin/agister ./cmd/agister
bin/agister --help          # every command and option
bin/agister init            # example settings into ~/.agister
bin/agister install home    # this owner's global settings into ~/.agister
bin/agister check           # validate the settings
bin/agister run ask_assistant --param question="What does cmd/agister do?"
bin/agister runs show <run-id>
bin/agister runs export <run-id> --to <dir> # a run's evidence, for audit
bin/agister pages           # a page of what the settings can run
```

Agister's generic code (the process supervisor, the manual clock, the
in-process fakes and the test-discipline check) is the `gokit` module next
to it, [../gokit](../gokit/README.md), which `go.mod` points at with a
`replace`: build from a checkout of the repository.

`agister pages` serves a local page that shows the workflows a
repository's settings can run and what they are made of:
[pages/README.md](pages/README.md).

## Settings

Global settings live in `~/.agister/` (`$AGISTER_HOME` or `--home`). The
worktree root's `.agister/` and the nearest project `.agister/` compose
over home, selected from the launch directory or `--dir`. Maps merge by
key; lists and scalars replace whole. Prompts, skills and schemas come
whole from the nearest layer. Commands check the composed settings before
use. See [settings and layering](docs/reference/settings-and-layering.md).

### Agents, processes and workflows

An agent is a runtime profile. A process defines the work, its inputs,
prompt, permissions, limits and output contract. A workflow binds each
node's process to an agent, as one call or a fan-out and join.
`agister run` runs workflows. Calls work in the caller's worktree and
leave changes there, uncommitted; runs are recorded in `<home>/runs/`.
See [processes and workflows](docs/reference/processes-and-workflows.md).

## Commands

Use `agister --help` for every option; `--version` identifies the binary.

| Command | Purpose |
| --- | --- |
| `init` | Install example settings into home |
| `install <dir>` / `install --restore <stamp>` | Install settings or restore a backup |
| `check` | Validate the composed settings |
| `agent create <name>` / `agent list` | Create or list runtime profiles |
| `process list` / `process show <name>` | Inspect work definitions |
| `workflow list` / `workflow show <name>` | Inspect bindings and plans |
| `run <workflow>` | Run a workflow (`--continue` resumes a call) |
| `runs [list]` / `runs show <id>` | List runs or read a record |
| `runs watch <id>` / `runs export <id>... --to <dir>` | Follow events or export evidence |
| `pages` | Serve the local settings and runs page |
| `version` | Identify the binary |

## Reference and decisions

The [behaviour reference](docs/reference/README.md) covers settings and
layering, processes and workflows, permissions and runtimes, runs and
records, the worktree and holds, skills, and home.
The [ADR list](docs/adr/) records the decisions behind that behaviour.

## Test

The commands are in [AGENTS.md](AGENTS.md); they check `gokit` too. CI:
`.github/workflows/agister-core.yml`.

Known gaps: backlog issues in the Multica project Agister
([docs/deferred.md](docs/deferred.md)). Ideas:
[backlog/](backlog/README.md).
