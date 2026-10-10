# Warder

A local monitor for coding agents: it reads the state of the agents of
each enabled source at an interval and writes every complete observation
as one JSON line on stdout. A source is Claude Code or Codex. The design,
the Codex mechanism included, is
[docs/agent-monitoring-mvp.md](docs/agent-monitoring-mvp.md).

## Requirements

- Go 1.24 or later.
- `GOPRIVATE=github.com/igor1309/ai-labs`: the module requires gokit from
  this private repository.
- For a Claude Code source, the `claude` CLI on `PATH`: warder runs
  `claude agents --json`.
- For a Codex source, macOS or another Unix: warder reads the files of the
  Codex home, `$CODEX_HOME` or `~/.codex`, and runs no command.

## Build and run

```bash
cd warder && go build ./cmd/warder
./warder -h
./warder -claude claude-local -codex codex-local | jq -c .
```

`-h` prints the usage, the flags and the exit codes.

## Output

- stdout: one observation per successful read, and nothing else.
- stderr: one `warder: <source-id>: <error>` line per failed or timed-out
  read (the source goes on), warder's own `warder: <error>` messages, and
  with `-verbose` one `log/slog` record per step.

## Stopping

SIGINT or SIGTERM ends the read in progress and exits 0 once every source
has stopped. A first signal waits for a pending write to stdout; a second
one ends a run whose stdout consumer stopped reading. Warder does not
restart itself.

## Known gaps

- A Codex desktop-app thread stays locked while the app has it loaded: it
  is reported as `idle` for days after its last turn.
- A `codex exec --ephemeral` run writes no session files and is
  invisible.
