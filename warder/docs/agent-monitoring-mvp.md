# Coding Agent Monitor — MVP Architecture

**Status:** Architecture draft · **Updated:** 2026-10-09

## Purpose

A small, reusable tool that periodically **reads coding-agent state** and emits complete, timestamped observations for other programs. Each observation answers: *Which agents did this source report, and what state were they in?*

The monitor observes; it does not retain history, infer transitions or freshness, present a UI, or manage the coding agents themselves. Claude Code is the first runtime adapter; the core is runtime-neutral.

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

## Composition and components

**Client-owned interfaces:** A component defines the capabilities it needs from collaborators; the composition root injects implementations. Components are logical boundaries, not prescribed types or packages.

| Component | Responsibility | Interface it satisfies | Interfaces it requires — capability |
|---|---|---|---|
| **Composition root** | Select source instances and wire the application. | Application entry point | Constructs providers and injects them; no observation logic. |
| **Application runner** | Run source loops concurrently and stop them on application cancellation. | Entry point invoked by composition root | `Runnable` — start/cancel a source loop and surface its fatal errors. |
| **Source loop** *(per source)* | Run attempts sequentially, then wait before the next attempt. | Runner's `Runnable` | `Attempt` — execute one cancellable attempt; `Wait` — interruptible elapsed-time wait. |
| **Observation attempt** *(per source)* | Coordinate a timed read; publish success or report failure. | Loop's `Attempt` | `Capture` — complete observation or error, cancellable; `Deadline` — limit the read and request cancellation; `Publish` — publish a complete observation and surface write errors; `Report` — emit a diagnostic. |
| **Observation capture** *(per source)* | Check the common model, timestamp the result, assemble an observation. | Attempt's `Capture` | `ReadAgents` — complete normalized agent set or error, cancellable; `Clock` — current wall-clock time. |
| **Runtime adapter** *(per source)* | Read runtime-specific information and normalize agent IDs and states. | Capture's `ReadAgents` | Runtime-specific I/O port, e.g. `ExecuteCommand` — execute a cancellable command and return its result. |
| **JSONL publisher** *(one instance)* | Serialize complete records safely from concurrent source loops. | Each attempt's `Publish` | `RecordWriter` — write bytes to the supplied output and report errors. |

Each attempt owns its `Publish` interface. **The composition root injects the same publisher instance** wherever that interface is required. Sharing an implementation does not make an interface shared or change its ownership.

The clock, waiting, deadline, runtime I/O, stdout writer, and stderr reporter are supplied at the boundary rather than accessed as hidden globals. Cancellation of a read propagates through its dependencies; how native I/O releases resources is the relevant adapter's implementation concern.

### Dependency map

`A —Port→ B` means **A calls its own port, implemented by B**. Arrows indicate calls/dependencies, not construction or ownership. The composition root constructs and connects these components.

```text
Application runner —Runnable→ Source loop (one per source)
Source loop        —Attempt─→ Observation attempt
Source loop        —Wait────→ Timer adapter

Observation attempt —Capture─→ Observation capture
Observation attempt —Publish─→ Shared JSONL publisher —RecordWriter→ stdout adapter
Observation attempt —Report──→ stderr adapter
Observation attempt —Deadline→ Deadline/timer adapter

Observation capture —ReadAgents→ Runtime adapter —ExecuteCommand→ OS process adapter [if CLI-based]
Observation capture —Clock────→ System-clock adapter
```

## Runtime behavior

- The caller explicitly enables one or more source instances, each with a distinct `source` ID and its own sequential polling loop.
- A source attempts its first read immediately. After each attempt, it waits its configured interval before trying again. Initial Claude settings: **5-second read timeout and 5-second post-attempt wait**.
- A successful read emits one complete observation. A failed or timed-out read emits no observation on stdout; diagnostics go to stderr. A later attempt proceeds on its normal schedule.
- One source's read failure or delay does not block other sources' reads. Publication uses a single serialized stdout writer, so output backpressure can delay publication.
- An unrecoverable output error ends the monitor with a nonzero exit. The caller or service manager owns monitor-process supervision and restart.

## First adapter and ownership boundaries

The first adapter is **Claude Code**. Its implementation determines how to discover and interpret Claude sessions through native facilities. Before implementation is committed to a specific read mechanism, verify that it covers the intended active sessions, states, and empty-result behavior.

**Monitor:** produces normalized observations. **Adapter:** knows one runtime's details. **Caller:** selects sources and supervises the tool. **Consumers:** decide what observations mean over time and how to store or display them.
