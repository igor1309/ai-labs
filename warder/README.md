# Warder

A local monitor for coding agents: it reads the state of the agents of
each enabled source at an interval and writes every complete observation
as one JSON line on stdout. The design is
[docs/agent-monitoring-mvp.md](docs/agent-monitoring-mvp.md).

This page says how to build and run warder from a checkout of the
repository. For changing its code, see [AGENTS.md](AGENTS.md).

## Requirements

- Go 1.24 or later (`go.mod`).
- `GOPRIVATE=github.com/igor1309/ai-labs` in the environment: the module
  requires gokit, which comes from this private repository. Go fetches it
  to run the tests (`scripts/test.sh`); the build itself fetches nothing.
- The `claude` CLI (Claude Code) on `PATH`: warder reads a Claude Code
  source by running `claude agents --json`. Without it warder still
  starts, and every read fails with a line on stderr.

## Build

```bash
cd warder && go build ./cmd/warder
```

The binary is `warder/warder`.

## Run

```text
warder [-verbose] -claude <source-id> [-claude <source-id> ...]
```

- `-claude <source-id>` enables one Claude Code source under that source
  ID. It is repeatable: each one is a source with its own polling loop.
  The ID is the `source` of its observations and names it in its
  diagnostics and log records. Every Claude Code source reads the same
  thing, the sessions `claude agents --json` reports.
- `-verbose` adds a log record per step on stderr (see
  [stderr](#stderr)).

A usage error is: no source, an empty or duplicate ID, an ID that is not
valid UTF-8, a `-verbose` that is not a boolean (`-verbose=maybe`), an
unknown flag or a stray argument. There is no help flag: `-h` and `-help`
are usage errors too. A usage error writes `warder: <error>` and the
usage line above on stderr, starts nothing and exits 2.

### Example

```bash
./warder -claude local | jq .
```

Warder writes one line per successful read, the first at once, and `jq`
prints each as it arrives. A line as warder writes it:

```json
{"source":"local","observedAt":"2026-10-09T18:56:15Z","agents":[{"id":"3f2b8c1e-5d47-4a9e-b1c6-0e8a7d2f9b34","state":"working"},{"id":"a17c4e90-2b6d-4f38-9c05-6d1e8b3a7f52","state":"idle"}]}
```

| Field | Meaning |
|---|---|
| `source` | The source ID given to `-claude`. |
| `observedAt` | UTC RFC 3339 time, to the second, when the complete read succeeded. |
| `agents` | The complete set the source reported in that read; `[]` when it reported none. |
| `agents[].id` | The Claude Code session's ID (its `sessionId`): nonempty, unique within the observation. |
| `agents[].state` | `working` (Claude Code's status `busy`), `idle` (its status `idle`) or `unknown` (anything else, as a background session's state is). |

What an observation means, and what it does not, is the design's
[observation contract](docs/agent-monitoring-mvp.md#observation-contract).

## Settings

There is no settings file and no flag for them: the settings are
constants in `cmd/warder/main.go`. A Claude Code source's read is limited
to 5 seconds (`claudeReadTimeout`), and it waits 5 seconds after each
attempt, successful or not, before the next (`claudePostAttemptWait`).
The first read is made at once.

## Output

### stdout

One JSON line per successful read, the design's observation contract.
Nothing else is written there. A read that failed or timed out writes no
line.

SIGPIPE is ignored: a stdout whose reader is gone is an output error,
which exits 1.

### stderr

- One line per read that failed or timed out,
  `warder: <source-id>: <error>`. The source goes on: its next attempt is
  made after the usual wait.

  ```text
  warder: local: attempt: read failed: capture: read agents: claude: execute claude agents --json: exec: "claude": executable file not found in $PATH
  warder: local: attempt: read timed out: capture: read agents: claude: execute claude agents --json: ended with its context: context deadline exceeded
  ```

- Warder's own messages, `warder: <error>`: a usage error, or the failure
  that ends it.
- With `-verbose`, also one `log/slog` text record per execution, read,
  capture, deadline, publish and wait, at `level=DEBUG`:
  `time=<clock time> level=DEBUG msg=<step> source=<source-id> [step's
  own attributes] outcome=ok|error [error=<error>] duration=<duration>`.
  The step's own attributes are `command` for an execution, `limit` and
  `expired` (whether the limit ended the read) for a deadline, and
  `interval` for a wait. `time` is when the step ended and `duration` how
  long it took, both by warder's clock, the system's. One attempt and the
  wait after it:

  ```text
  time=2026-10-09T21:56:15.135+03:00 level=DEBUG msg=execute source=local command=claude outcome=ok duration=180.333334ms
  time=2026-10-09T21:56:15.135+03:00 level=DEBUG msg="read agents" source=local outcome=ok duration=180.68325ms
  time=2026-10-09T21:56:15.135+03:00 level=DEBUG msg=capture source=local outcome=ok duration=180.69375ms
  time=2026-10-09T21:56:15.135+03:00 level=DEBUG msg=publish source=local outcome=ok duration=49.75µs
  time=2026-10-09T21:56:15.135+03:00 level=DEBUG msg=deadline source=local limit=5s expired=false outcome=ok duration=180.801292ms
  time=2026-10-09T21:56:20.136+03:00 level=DEBUG msg=wait source=local interval=5s outcome=ok duration=5.001051792s
  ```

Records and diagnostics share one serialized writer, one write per line,
so a record never interleaves with a diagnostic. Without `-verbose`
logging is off and stderr carries diagnostics only.

## Shutdown

SIGINT (Ctrl-C) or SIGTERM cancels the run: the read in progress is
ended, no further attempt is made, and warder exits 0 once every source
loop has returned.

The design allows backpressure on stdout, so a first SIGINT or SIGTERM
waits for a pending write to stdout; there is no interruptible output.
Once the first signal has cancelled the run, both signals have their
default behaviour again: a second SIGINT or SIGTERM ends a run held by a
stdout consumer that stopped reading.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | SIGINT or SIGTERM cancelled the run, after every source loop returned. |
| 1 | A failure warder cannot recover from, as an output error is; stderr says `warder: <error>`. |
| 2 | A usage error, with nothing started. |

Warder does not restart itself: the design leaves supervising and
restarting it to whoever runs it.
