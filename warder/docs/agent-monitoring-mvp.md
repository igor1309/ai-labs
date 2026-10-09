# Coding Agent Monitor — MVP Specification

**Status:** Modular architecture draft for review (Edition 8)  
**Updated:** 2026-10-09

## Goal

Provide a small, reusable tool that periodically observes active coding-agent sessions and publishes **complete, timestamped observations** for other programs to consume.

Each observation answers: **Which agents did one source report, what state was each in, and when did that observation complete?** The monitor produces observations; consumers decide how to retain, compare, interpret, or present them.

Claude Code is the first runtime integration, not the definition of the common model.

## Observation contract

Each successful observation is one JSON object on one stdout line:

```json
{"source":"claude-main","observedAt":"2026-10-09T08:28:10Z","agents":[{"id":"opaque-agent-id","state":"working"}]}
```

| Field | Contract |
|---|---|
| `source` | Nonempty, unique identifier of a configured adapter **instance**. Multiple instances of one adapter type are allowed. |
| `observedAt` | Completion time of a successful, validated observation, as RFC 3339 UTC. Fractional precision is not fixed. |
| `agents` | Complete set reported by that source, possibly empty. |
| `agents[].id` | Nonempty opaque identity, unique within that source observation. |
| `agents[].state` | One of `working`, `idle`, or `unknown`. This is a closed vocabulary; introducing a new state requires a compatibility decision. |

Agent identity is `(source, id)`. Each adapter preserves an agent's native identity across observations and monitor restarts **for the same surviving agent**, to the extent the runtime supports that identity. The core imposes no UUID, PID, or format convention.

`unknown` means a discovered agent's state could not be mapped confidently **during an otherwise successful observation**. It does not mean observation failure. Invalid or duplicate agent IDs invalidate the entire source observation. A valid empty set is published.

If an agent is absent from a subsequent **successful** observation for its source, that source did not report the agent at that time; absence alone does not establish that the agent terminated.

Within each source, **stream record order** is the observation sequence; records from different sources have no guaranteed relative order. `observedAt` is a wall-clock timestamp and may move backwards after clock adjustments; consumers must not use it to reorder a source's records. It marks completion of capture, **not the instant every agent's state was read**; publication can occur later. Consumers parse timestamps as instants and ignore unrecognized fields. New optional fields may be additive; incompatible changes, including new state values, require an explicit compatibility decision.

## Architecture

### Composition rule

**The client defines the smallest interface (port) it requires; the composition root supplies an implementation.** In Swift, a port may be expressed as a protocol or a protocol witness (a value carrying functions). Interface requirements specify **capabilities and behavior**, including cancellation—not merely method names. Core components do not access global clocks, stdout/stderr, CLI, or OS processes directly.

Components below are logical units, not prescribed classes, packages, actors, or processes.

### Components

| Component | Responsibility | Ports it requires (client-owned) | Client port it satisfies | Scope |
|---|---|---|---|---|
| **Composition root** | Validate configuration, create implementations, and wire ports to providers; no monitoring logic. | None | None; constructs the graph. | One. |
| **Application runner** | Run source loops concurrently; coordinate cancellation and fatal termination. | `Runnable` | Entry point called by composition root. | One. |
| **Source loop** | Invoke attempts sequentially with a post-attempt wait. | `Attempt`, `Wait` | Runner's `Runnable` | Per source. |
| **Observation attempt** | Bound capture; publish only complete successful observations; report recoverable failures; propagate fatal cleanup or publication errors. | `Capture`, `Deadline`, `Publish`, `Report` | Loop's `Attempt` | Per source. |
| **Observation capture** | Validate agents, timestamp completion, assemble one observation. | `ReadAgents`, `Clock` | Attempt's `Capture` | Per source. |
| **Runtime adapter** | Discover native agents and normalize IDs and states. | `ExecuteCommand` if CLI-based; runtime-specific ports otherwise. | Capture's `ReadAgents` | Per source. |
| **JSONL publisher** | Serialize complete JSON Lines records from competing sources. | `RecordWriter` | Each attempt's `Publish` | **One shared instance.** |

### Client-owned ports and required capabilities

| Client | Interface / port | Required capabilities (provider's contract) |
|---|---|---|
| **Application runner** | `Runnable` | Run asynchronously until cancelled or failed; respond to application cancellation; propagate fatal errors to the runner. |
| **Source loop** | `Attempt` | Run asynchronously to completion or fatal error; on cancellation, propagate cancellation to in-flight work and stop. |
| **Source loop** | `Wait` | Wait for a configured duration using elapsed/monotonic time; interruption/cancellation must end the wait promptly. |
| **Observation attempt** | `Capture` | Return **one complete observation or an error**; support cancellation, including cancellation of its `ReadAgents` dependency. |
| **Observation attempt** | `Deadline` | Apply a deadline to **capture**, not stdout publication, using elapsed time. On expiry, cancel in-flight work and obtain a cleanup outcome. Timeout triggers cancellation; it does **not** guarantee the attempt finishes at that instant. Failed or impossible cleanup is fatal, and no further attempt starts for that source. |
| **Observation attempt** | `Publish` | Accept a complete observation, serialize concurrent publication safely through its provider, preserve per-source record order, and propagate write failures as fatal errors. No stream access required of the client. |
| **Observation attempt** | `Report` | Emit diagnostics through an injected sink. Deciding whether to publish an observation belongs to the observation attempt, not the reporter. |
| **Observation capture** | `ReadAgents` | Return the **complete normalized set** of agents (including an empty set) or an error; preserve identity semantics; honour cancellation and terminate underlying runtime work. Partial results never count as success. |
| **Observation capture** | `Clock` | Supply the wall-clock instant at successful completion, for `observedAt`; replaceable with a controlled clock in tests. Distinct from elapsed-time scheduling/deadlines. |
| **CLI runtime adapter** | `ExecuteCommand` | Launch a configured subprocess, return output/exit status or error, and on cancellation/timeout **terminate and reap** the work it started (including descendants where applicable). Must not accumulate orphaned invocations. |
| **JSONL publisher** | `RecordWriter` | Write encoded bytes to the injected stream and surface write failures (including broken pipe); may apply backpressure. The publisher—not this interface alone—serializes concurrent observations into whole lines. |

**Sharing is a composition decision, not an interface property.** Each observation attempt depends on a `Publish` interface that it owns. The composition root may satisfy every such dependency with **the same concurrency-safe JSONL publisher instance**. The publisher in turn depends on its own `RecordWriter` port backed by stdout. Likewise, source loops are independent instances even when they conform to the same `Runnable` contract.

**Cancellation is transitive where work is in flight:** deadline → capture → runtime adapter → command executor → subprocess termination/reaping. Application cancellation likewise propagates runner → source loop → active attempt and its dependencies. Stopping an await without stopping underlying work is not cancellation of that work. If cleanup fails, the attempt fails fatally rather than allowing overlapping or orphaned operations.

### Dependency map

**Arrow legend:** `A —port→ B` means *A calls a port it owns, supplied by B*. The arrow denotes a **call/dependency**, not ownership, object construction, or unmediated access. The composition root constructs the graph and supplies each B to its client A; its wiring is intentionally omitted from the arrows.

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

There is **one independent source loop / capture / runtime adapter instance per configured source**, and **one shared publisher instance**. Adapters of the same type can be instantiated repeatedly with different configuration and source IDs.

### One attempt, end to end

1. A source loop starts an attempt. The attempt applies its configured capture deadline.
2. Capture reads a complete normalized set through `ReadAgents`, validates IDs and states, assigns `observedAt` at successful completion through `Clock`, and assembles an observation.
3. The attempt calls its `Publish` port. The publisher serializes the observation into one JSON line and coordinates writes across all sources.
4. If capture fails, is invalid, or times out, the **attempt emits no stdout observation**. Recoverable failures are reported; the source loop resumes after its wait. Publication failure is fatal.
5. On timeout, the attempt cancels capture and awaits its cleanup outcome. Successful cleanup permits the normal retry cycle; failed cleanup is fatal and prevents a further attempt. On application shutdown, cancellation propagates through active work and the loop exits rather than retrying.

Shared stdout can block publication and delay a source's next attempt. Independent polling means one adapter's observation failure or execution delay does not stop other adapters, **except when shared output or application shutdown is involved**. The MVP does not promise backpressure isolation or an unbounded queue.

### Lifecycle and configuration

- The caller explicitly selects at least one adapter instance; unknown adapter types, duplicate source IDs, and zero enabled sources fail at startup with a nonzero exit.
- Each source loop attempts immediately, waits its configured interval **after each completed attempt**, and never overlaps its own attempts.
- Initial Claude defaults: **5-second capture timeout** and **5-second post-attempt wait**, with the wait configurable; other adapters may have their own settings.
- A deadline triggers cancellation of dependent operations; cleanup can outlast the deadline. Another attempt for the same source starts only after cleanup succeeds. Cleanup failure is fatal to the monitor.
- The application runner coordinates graceful cancellation. The publisher never deliberately starts a partial record; abrupt termination or output failure cannot guarantee delivery of an in-progress record.
- Broken stdout or another unrecoverable publication failure terminates the monitor nonzero. External callers / OS service managers supervise and restart the **monitor process**.
- Diagnostics pass through the injected reporter (stderr in the CLI tool). Observation data alone goes to stdout.

## First adapter: Claude Code

The Claude adapter initially uses `claude agents --json`. It alone interprets native command output, session membership, IDs, and statuses. Its initial state mapping is `busy → working`, `idle → idle`, and other or unrecognized statuses → `unknown` when the observation itself is valid.

**Implementation prerequisite:** Verify empirically whether the command reports the active sessions required by the goal, including foreground/background, busy/idle/waiting, empty results, failures, and latency. If its coverage is inadequate, revisit this adapter, not the common model or core scheduling.

## Consumer and caller boundaries

**Consumers** own last-known state, freshness/staleness thresholds, reconciliation/change detection, aggregation across sources, storage, analytics, UIs, and notifications. They acquire cadence settings separately if needed; stdout contains observations only.

**Callers** own startup configuration and supervision/restart of the monitor process.

No internal snapshot cache, history, reconciler, freshness classifier, database, HTTP service, or dashboard is required.

## Implementation discretion

Swift protocol versus protocol-witness syntax, module/package layout, concurrency primitives, CLI options, timestamp fractional precision, process-group cleanup mechanics, and shutdown signaling are implementation choices **provided the required port capabilities are satisfied**.
