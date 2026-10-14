# Coding Agent Monitor — MVP Architecture

**Status:** Architecture draft · **Updated:** 2026-10-09

## Purpose

A small, reusable tool that periodically **reads coding-agent state** and emits complete, timestamped observations for other programs. Each observation answers: *Which agents did this source report, and what state were they in?*

The monitor observes; it does not retain history, infer transitions or freshness, present a UI, or manage the coding agents themselves. Claude Code is the first runtime adapter and Codex the second; the core is runtime-neutral.

## Observation contract

One successful read produces one JSON object on one stdout line:

```json
{"source":"claude-main","observedAt":"2026-10-09T08:28:10Z","agents":[{"id":"opaque-agent-id","state":"working"}]}
```

| Field | Meaning |
|---|---|
| `source` | Opaque ID of the configured adapter instance, unique within the monitor. |
| `observedAt` | UTC RFC 3339 time when the complete read succeeded. |
| `agents` | Complete set reported by that source; may be empty. |
| `agents[].id` | Nonempty opaque ID, unique within this source's observation. |
| `agents[].state` | `working`, `idle`, or `unknown`. |

An agent is identified by `(source, id)`. The adapter maintains identity according to the runtime's semantics; a monitor restart alone does not create a new identity for a surviving agent.

`unknown` describes an agent whose state cannot be classified during a successful read. A failed read produces **no observation**; invalid IDs or incomplete results invalidate the whole read. Absence from a successful observation means the source did not report that agent, not necessarily that it terminated.

Records from a given source are emitted in observation order. No cross-source order is guaranteed. `observedAt` is a wall-clock completion timestamp, not an ordering key or an exact timestamp for each agent's state.

**Output streams:** stdout carries observations and nothing else. stderr carries diagnostics plus opt-in logs: by default diagnostics only, and with `-verbose` also one `log/slog` text record per logged step. Both go through one serialized stderr writer, so a log record never interleaves with a diagnostic line.

## Composition and components

**Client-owned interfaces:** A component defines the capabilities it needs from collaborators; the composition root injects implementations. Components are logical boundaries, not prescribed types or packages.

| Component | Responsibility | Interface it satisfies | Interfaces it requires — capability |
|---|---|---|---|
| **Composition root** | Select source instances and wire the application. | Application entry point | Constructs providers and injects them; no observation logic. |
| **Application runner** | Run source loops concurrently and stop them on application cancellation. | Entry point invoked by composition root | `Runnable` — start/cancel a source loop and surface its fatal errors. |
| **Source loop** *(per source)* | Run attempts sequentially, then wait before the next attempt. | Runner's `Runnable` | `Attempt` — execute one cancellable attempt; `Wait` — interruptible elapsed-time wait. |
| **Observation attempt** *(per source)* | Coordinate a timed read; publish success or report failure. | Loop's `Attempt` | `Capture` — complete observation or error, cancellable; `Deadline` — limit the read and request cancellation; `Publish` — publish a complete observation and surface write errors; `Report` — emit a diagnostic. |
| **Observation capture** *(per source)* | Check the common model, timestamp the result, assemble an observation. | Attempt's `Capture` | `ReadAgents` — complete normalized agent set or error, cancellable; `Clock` — current wall-clock time. |
| **Runtime adapter** *(per source)* | Read runtime-specific information and normalize agent IDs and states. | Capture's `ReadAgents` | Runtime-specific I/O port: Claude Code's `ExecuteCommand` — execute a cancellable command and return its result; Codex's `Files` — list a directory, probe a file's lock, find files by name, and read a file's size and a range of its bytes, each cancellable. |
| **JSONL publisher** *(one instance)* | Serialize complete records safely from concurrent source loops. | Each attempt's `Publish` | `RecordWriter` — write bytes to the supplied output and report errors. |

Each attempt owns its `Publish` interface. **The composition root injects the same publisher instance** wherever that interface is required. Sharing an implementation does not make an interface shared or change its ownership.

The clock, waiting, deadline, runtime I/O, stdout writer, stderr reporter, and logger are supplied at the boundary rather than accessed as hidden globals. Cancellation of a read propagates through its dependencies; how native I/O releases resources is the relevant adapter's implementation concern.

**Logging is decorated, never built in.** The composition root wraps the read (`ReadAgents`), the runtime I/O under it (Claude Code's command execution, each of Codex's file operations), the capture, the deadline, the publish and the wait in logging decorators. Each implements the interface of what it wraps, changes no argument, result, error or cancellation, and records the source ID, the outcome and the duration, timed by the injected clock, through the one logger the root is given. The components do not know the decorators or the logger.

### Dependency map

`A —Port→ B` means **A calls its own port, implemented by B**. Arrows indicate calls/dependencies, not construction or ownership. The composition root constructs and connects these components. `[logged]` marks a port the root wraps in a logging decorator: the call passes through the decorator to B unchanged, and B does not know it.

```text
Application runner —Runnable→ Source loop (one per source)
Source loop        —Attempt─→ Observation attempt
Source loop        —Wait────→ Timer adapter                                  [logged]

Observation attempt —Capture─→ Observation capture                         [logged]
Observation attempt —Publish─→ Shared JSONL publisher —RecordWriter→ stdout adapter   [Publish logged]
Observation attempt —Report──→ stderr adapter
Observation attempt —Deadline→ Deadline/timer adapter                      [logged]

Observation capture —ReadAgents→ Claude Code adapter —ExecuteCommand→ OS process adapter [both logged]
Observation capture —ReadAgents→ Codex adapter       —Files─────────→ OS file adapter    [both logged]
Observation capture —Clock────→ System-clock adapter

Logging decorators —Logger→ slog text handler —→ stderr adapter (the diagnostics' serialized writer)
Logging decorators —Clock──→ System-clock adapter
```

## Runtime behavior

- The caller explicitly enables one or more source instances, of one runtime or of both, each with a distinct `source` ID and its own sequential polling loop. A `source` ID is distinct across runtimes too.
- A source attempts its first read immediately. After each attempt, it waits its configured interval before trying again. Initial Claude settings: **5-second read timeout and 5-second post-attempt wait**. Codex has settings of its own, initially the same two values.
- A successful read emits one complete observation. A failed or timed-out read emits no observation on stdout; diagnostics go to stderr. A later attempt proceeds on its normal schedule.
- One source's read failure or delay does not block other sources' reads. Publication uses a single serialized stdout writer, so output backpressure can delay publication.
- An unrecoverable output error ends the monitor with a nonzero exit. The caller or service manager owns monitor-process supervision and restart.

## First adapter and ownership boundaries

The first adapter is **Claude Code**. Its implementation determines how to discover and interpret Claude sessions through native facilities. Before implementation is committed to a specific read mechanism, verify that it covers the intended active sessions, states, and empty-result behavior.

**Monitor:** produces normalized observations. **Adapter:** knows one runtime's details. **Caller:** selects sources and supervises the tool. **Consumers:** decide what observations mean over time and how to store or display them.

## Second adapter: Codex

The second adapter is **Codex**. It reads the files of the Codex home (`$CODEX_HOME`, else `~/.codex`) and runs no command. The composition root owns the OS file adapter and resolves the home; the adapter knows the layout below and nothing of the file system.

### Mechanism

1. **Which sessions are active, and their IDs.** A process that has a thread open holds an exclusive `flock` on `<codex-home>/thread-writer-locks/<thread-id>.lock`. Each such file that another process holds is one agent, and `<thread-id>` is its ID. The adapter probes each file with a non-blocking shared `flock`: "would block" means held, so active; a probe that acquires the lock found a stale file, releases at once and skips it. `.coordination.lock` is not a session. A lock file gone between the listing and the probe is a session that ended.
2. **The state.** The thread's rollout file is `<codex-home>/sessions/YYYY/MM/DD/rollout-<timestamp>-<thread-id>.jsonl`, one JSON object per line: `{"timestamp","ordinal","type","payload"}`. The last line whose `type` is `event_msg` and whose `payload.type` is a turn marker decides: `task_started` is `working`; `task_complete` and `turn_aborted` are `idle`. The marker can be megabytes from the end (rollout files reach 16 MB, single lines 2.6 MB), so the file is scanned backwards in chunks (1 MiB) up to a cap (32 MiB), lines that span chunks included. An unterminated last line is one being written, and is ignored.

| Condition | Result |
|---|---|
| No `thread-writer-locks` directory, an empty one, or only stale lock files | A successful read of an empty set. |
| No rollout file for the thread, no turn marker in it, or the scan reached its cap without finding one (a marker found within the cap decides, at the cap's last byte too) | The agent's state is `unknown`. |
| A `.lock` name whose ID is empty or not valid UTF-8; two rollout files for one ID; any file error other than "does not exist" (listing, probing, finding, reading); the read's cancellation | The whole read fails: no observation. |

A Codex home that cannot be resolved (no `$CODEX_HOME` and no user home directory) fails every read, with a diagnostic; it is not an empty set.

### Sources

Observed on macOS on 2026-10-09 with codex-cli 0.162.0 (Homebrew) and the desktop app's bundled app-server (0.160.0).

**Candidates rejected:**

- **The CLI.** `codex agents` is a TUI with no JSON output, and it needs the shared app-server daemon, which was not running (`~/.codex/app-server-control/app-server-control.sock` was missing). `resume` and `fork` are interactive pickers. No command prints the active sessions.
- **The app-server protocol.** A fresh `codex app-server` answered `thread/loaded/list` with an empty list and `thread/list` with every thread `notLoaded`, while one of those threads was loaded in the desktop app-server at that moment. Live status stays inside the process that owns the thread; another process cannot ask for it.
- **`state_5.sqlite`.** It has no status column.

**Selected: the files.**

- `lsof` showed the lock files held by exactly the live processes: five `codex exec` runs with one each, and the desktop app-server with four. The shared non-blocking probe returned `EWOULDBLOCK` on each of them.
- The lock files of runs that exited were gone within seconds.
- The lock's base name equals `session_meta.payload.id` and the rollout file's suffix, so the ID survives a restart of warder, and `resume`.
- Live `exec` runs had `task_started` with no terminator after it; idle desktop threads had `task_complete` last.
- Other `event_msg` payload types seen, none a turn marker: `item_completed`, `token_count`, `thread_settings_applied` (which may follow `task_complete`).

**Known gaps:**

- An interactive TUI session was not observed live. Rollout files with `source: "cli"` exist and the writer lock is in the shared rollout code, so it is expected to hold one.
- A desktop thread stays locked, and `idle`, for as long as it is loaded: for days.
- `--ephemeral` runs write no rollout file and are invisible.
- Subagent threads were not observed live.
- A turn that waits for an approval reads as `working`.
- The probe holds its shared lock for an instant; an attempt by Codex itself to take that lock in that instant would fail.
- `.jsonl.zst` rollout files are named in the binary. None exist; one would read as `unknown`.
- The `flock` probe is Unix only.
