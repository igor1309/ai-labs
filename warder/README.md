# Warder

A local monitor for coding agents: it reads the state of the agents of
each enabled source at an interval and writes every complete observation
as one JSON line on stdout. A source is Claude Code or Codex. The design
is
[docs/agent-monitoring-mvp.md](docs/agent-monitoring-mvp.md).

This page says how to build and run warder from a checkout of the
repository. For changing its code, see [AGENTS.md](AGENTS.md).

## Requirements

- Go 1.24 or later (`go.mod`).
- `GOPRIVATE=github.com/igor1309/ai-labs` in the environment: the module
  requires gokit, which comes from this private repository. Go fetches it
  to run the tests (`scripts/test.sh`); the build itself fetches nothing.
- For a Claude Code source, the `claude` CLI (Claude Code) on `PATH`:
  warder reads such a source by running `claude agents --json`. Without
  it warder still starts, and every read of the source fails with a line
  on stderr.
- For a Codex source, macOS or another Unix, and nothing on `PATH`:
  warder runs no command for it. It reads the files of the Codex home
  and tells a live session by an `flock` probe (see
  [Codex sources](#codex-sources)). Where Codex never ran warder still
  starts, and every read reports no agents.

## Build

```bash
cd warder && go build ./cmd/warder
```

The binary is `warder/warder`.

## Run

```text
warder [-verbose] {-claude|-codex} <source-id> [{-claude|-codex} <source-id> ...]
```

- `-claude <source-id>` enables one Claude Code source under that source
  ID. It is repeatable: each one is a source with its own polling loop.
  The ID is the `source` of its observations and names it in its
  diagnostics and log records. Every Claude Code source reads the same
  thing, the sessions `claude agents --json` reports.
- `-codex <source-id>` enables one Codex source under that source ID,
  repeatable in the same way. Every Codex source reads the same thing,
  the sessions of the Codex home (see [Codex sources](#codex-sources)).
- Sources of both runtimes run together, in any order on the command
  line: a read of one that is slow or fails holds no other.
- `-verbose` adds a log record per step on stderr (see
  [stderr](#stderr)).

A usage error is: no source of either runtime, an empty ID, an ID given
twice, by one flag or by both (`-claude a -codex a`), an ID that is not
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
| `source` | The source ID given to `-claude` or `-codex`. |
| `observedAt` | UTC RFC 3339 time, to the second, when the complete read succeeded. |
| `agents` | The complete set the source reported in that read; `[]` when it reported none. |
| `agents[].id` | The session's ID, nonempty and unique within the observation: a Claude Code session's `sessionId`, a Codex session's thread ID. |
| `agents[].state` | For a Claude Code session: `working` (Claude Code's status `busy`), `idle` (its status `idle`) or `unknown` (anything else, as a background session's state is). For a Codex session: `working`, `idle` or `unknown`, by its last turn marker (see [Codex sources](#codex-sources)). |

What an observation means, and what it does not, is the design's
[observation contract](docs/agent-monitoring-mvp.md#observation-contract).

## Codex sources

A Codex source runs no command. It reads the files of the Codex home:
`$CODEX_HOME` when that is set and not empty, else `.codex` in the user's
home directory. Warder resolves it once, as it starts, and writes nothing
there.

```bash
./warder -codex local | jq -c .
```

```json
{"source":"local","observedAt":"2026-10-09T19:21:16Z","agents":[{"id":"01a121f6-1271-7293-871d-b887f0645f03","state":"working"}]}
```

- **Which sessions.** A Codex process that has a thread open holds an
  `flock` on `thread-writer-locks/<thread-id>.lock`. Each such file that
  another process holds is one agent, and `<thread-id>` is its ID, so a
  session keeps its ID across a restart of warder and a `codex resume`.
  Warder asks by trying to share the lock without waiting, and releases
  at once a lock it got: that file is a stale one, and no agent. Neither
  is `.coordination.lock`, nor a lock file that is gone before it is
  probed.
- **The state.** The last turn marker in the thread's rollout file,
  `sessions/YYYY/MM/DD/rollout-<timestamp>-<thread-id>.jsonl`, decides:
  `task_started` is `working`; `task_complete` and `turn_aborted` are
  `idle`. The state is `unknown` when the thread has no rollout file,
  when the file has no marker, and when none is found in the part of the
  file that is searched, from its end backwards (see
  [Settings](#settings)).
- **No session.** A home or a `thread-writer-locks` directory that does
  not exist, an empty one, and one with only stale lock files are each a
  successful read: a line with `"agents":[]`.
- **A failed read.** The whole read fails, with a line on stderr and none
  on stdout, when the home is not known (no `$CODEX_HOME` and no home
  directory of the user); on a lock file whose thread ID is empty or not
  valid UTF-8, or that is no regular file, as a FIFO or a directory is;
  on two rollout files for one thread; on any other error of a file, as a
  directory that cannot be read is; and when the read's limit ends it.

Known gaps:

- A thread of the Codex desktop app stays locked for as long as the app
  has it loaded: it is reported, as `idle`, for days after its last turn.
- A `codex exec --ephemeral` run writes no session files, and is
  invisible.
- The rest are in the design's
  [Sources](docs/agent-monitoring-mvp.md#sources).

## Settings

There is no settings file and no flag for them: the settings are
constants in `cmd/warder/main.go`, each runtime with its own. The first
read of every source is made at once.

- A Claude Code source's read is limited to 5 seconds
  (`claudeReadTimeout`), and it waits 5 seconds after each attempt,
  successful or not, before the next (`claudePostAttemptWait`).
- A Codex source's read is limited to 5 seconds (`codexReadTimeout`),
  and it waits 5 seconds after each attempt, successful or not, before
  the next (`codexPostAttemptWait`). It searches a rollout file for the
  last turn marker from the file's end backwards, 1 MiB at a time
  (`codexScanChunk`) and 32 MiB at most (`codexScanCap`): a session whose
  last marker is further from the end than that reads as `unknown`.

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

  The line of a Codex source says which file operation failed, or where
  the limit ended the read, in a file operation or between two:

  ```text
  warder: local: attempt: read failed: capture: read agents: codex: list thread-writer-locks: open /Users/me/.codex/thread-writer-locks: permission denied
  warder: local: attempt: read failed: capture: read agents: codex: list thread-writer-locks: no Codex home: $CODEX_HOME is not set and the user's home directory is not known
  warder: local: attempt: read timed out: capture: read agents: codex: find the rollout file of thread "01a121f6-1271-7293-871d-b887f0645f03": context deadline exceeded
  warder: local: attempt: read timed out: capture: read agents: codex: read thread-writer-locks: context deadline exceeded
  ```

- Warder's own messages, `warder: <error>`: a usage error, or the failure
  that ends it.
- With `-verbose`, also one `log/slog` text record per execution (a
  Claude Code source) or file operation (a Codex source), read, capture,
  deadline, publish and wait, at `level=DEBUG`:
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

  A Codex source's file operations are `list directory`, `probe lock`,
  `find files`, `file size` and `read file`. Each has the `path` it was
  asked for, from the Codex home; `find files` also the `prefix` and the
  `suffix` of the names it looks for, and `read file` the `offset` and
  the `length`, in bytes, of what it reads. An operation on what does not
  exist is recorded as an error, though the read goes on: where Codex
  never ran, the listing is `outcome=error` and the read `outcome=ok`.
  One attempt, of one session, and the wait after it:

  ```text
  time=2026-10-09T22:21:16.481+03:00 level=DEBUG msg="list directory" source=local path=thread-writer-locks outcome=ok duration=150.5µs
  time=2026-10-09T22:21:16.481+03:00 level=DEBUG msg="probe lock" source=local path=thread-writer-locks/01a121f6-1271-7293-871d-b887f0645f03.lock outcome=ok duration=18.583µs
  time=2026-10-09T22:21:16.481+03:00 level=DEBUG msg="find files" source=local path=sessions prefix=rollout- suffix=-01a121f6-1271-7293-871d-b887f0645f03.jsonl outcome=ok duration=81.5µs
  time=2026-10-09T22:21:16.481+03:00 level=DEBUG msg="file size" source=local path=sessions/2026/10/09/rollout-2026-10-09T21-38-57-01a121f6-1271-7293-871d-b887f0645f03.jsonl outcome=ok duration=6.417µs
  time=2026-10-09T22:21:16.482+03:00 level=DEBUG msg="read file" source=local path=sessions/2026/10/09/rollout-2026-10-09T21-38-57-01a121f6-1271-7293-871d-b887f0645f03.jsonl offset=0 length=226 outcome=ok duration=17.333µs
  time=2026-10-09T22:21:16.482+03:00 level=DEBUG msg="read agents" source=local outcome=ok duration=546.458µs
  time=2026-10-09T22:21:16.482+03:00 level=DEBUG msg=capture source=local outcome=ok duration=548.959µs
  time=2026-10-09T22:21:16.482+03:00 level=DEBUG msg=publish source=local outcome=ok duration=31.833µs
  time=2026-10-09T22:21:16.482+03:00 level=DEBUG msg=deadline source=local limit=5s expired=false outcome=ok duration=678.625µs
  time=2026-10-09T22:21:21.482+03:00 level=DEBUG msg=wait source=local interval=5s outcome=ok duration=5.0005625s
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
