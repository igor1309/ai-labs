---
date: 2026-10-09
author: Igor Malyarov
model: gpt-6
version: 0.0.1
---

# Coding Agent Monitor — MVP Specification

**Status:** Agreed product scope and architecture  
**Updated:** 2026-10-09

## Goal

Build a small, reusable tool that periodically observes active coding-agent sessions and publishes **complete, timestamped observations** for other programs to consume.

Each observation answers: **Which agents did a source report, what state was each in, and when did the observation complete?**

The monitor produces observations. Consumers decide how to retain, combine, interpret, or display them.

## Scope

- Observe explicitly enabled coding-agent runtimes through independent adapter instances.
- Normalize discovered agents to opaque identities and a small common state model.
- Publish a complete observation **per source** after each successful attempt.
- Continue observing after recoverable failures.
- Implement the **Claude Code adapter first** without coupling the core contract to Claude-specific behavior.

## Observation contract

Each successful observation produces one JSON object on one line of stdout (JSON Lines / NDJSON):

```json
{"source":"claude-main","observedAt":"2026-10-09T08:28:10Z","agents":[{"id":"opaque-agent-id","state":"working"}]}
```

| Field | Meaning |
|---|---|
| `source` | Nonempty, unique identifier of an enabled **adapter instance**, assigned through caller configuration. Multiple instances of the same runtime adapter may have different source IDs. |
| `observedAt` | Time a complete observation succeeded, serialized as RFC 3339 UTC. Fractional-second precision is not fixed. |
| `agents` | Complete set of agents reported by that source; may be empty. |
| `agents[].id` | Nonempty, opaque agent identifier; unique within the source observation. |
| `agents[].state` | `working`, `idle`, or `unknown`. |

Agent identity is the pair **`(source, id)`**. The adapter determines what counts as the same native agent and supplies stable IDs across observations, including across monitor restarts for a surviving agent, subject to the runtime's identity semantics. The common contract does not prescribe UUIDs, PIDs, or another identifier format.

`unknown` means the agent was discovered during a successful observation but its native status cannot be determined or mapped confidently. It does **not** represent an unsuccessful observation.

A valid empty result emits `"agents":[]`. Empty or duplicate agent IDs invalidate the **entire source observation**, not just the affected entries. Agent records contain only `id` and `state` in the MVP.

**Compatibility:** Consumers ignore unrecognized JSON fields. Optional fields may be added without changing existing field meanings. Incompatible changes require an explicit compatibility decision when introduced.

**Ordering:** Records from the **same source** are emitted in observation order. No ordering is guaranteed between sources. Consumers should parse timestamps as instants rather than assume their textual order reflects chronology; wall-clock time can change.

## Architecture and responsibilities

```text
Caller / OS supervisor
        │
        ▼
Monitor process (explicitly selected adapter instances)
        │
        ├─ Independent sequential poller ── Runtime adapter instance A ──┐
        ├─ Independent sequential poller ── Runtime adapter instance B ──┤
        └─ ...                                                          │
                                                                         ▼
                                                       Form timestamped observation
                                                                         │
                                                                         ▼
                                                       Shared JSON Lines stdout writer

Failed attempt ──► stderr diagnostic; no stdout observation
```

| Responsibility | Owner |
|---|---|
| Validate configuration; select and start adapter instances | Monitor entry point |
| Schedule attempts, enforce timeouts, retry on the next cycle | One sequential polling loop per adapter instance |
| Discover native agents; normalize identity/state; validate a complete result | Runtime adapter |
| Assign `observedAt` on success; assemble the source-scoped record | Observation assembly |
| Serialize complete records without interleaving lines; preserve per-source order | Shared stdout writer |
| Launch, supervise, and restart the monitor process | External caller or OS service manager |

These are **responsibilities**, not required services, classes, or packages. Runtime-specific commands, files, fields, and status meanings remain inside adapters.

### Scheduling

Each enabled adapter instance starts its first observation **immediately**, then runs a **sequential** loop: finish an attempt, wait its configured interval, and try again. Attempts for that instance never overlap.

**Initial Claude defaults:** 5-second command timeout and 5-second wait **after** each attempt; the wait interval is configurable. Other adapters may have different execution parameters.

Observation execution is independent per adapter instance: one adapter's delay or failure does not prevent another from attempting an observation. Publication uses shared stdout, so a slow or blocked consumer can delay output from multiple sources; no isolation from shared-output backpressure is promised.

### Success, failure, and lifecycle

- **Successful attempt:** Emit exactly one complete snapshot for its source, including empty results and unchanged results.
- **Failed, timed-out, or invalid attempt:** Emit **no stdout observation** for that source; report a diagnostic on stderr and retry on the next regular cycle. Do not publish partial results or substitute an older snapshot.
- **Timed-out invocation:** Terminate the invocation and clean up processes it started as needed to prevent abandoned polling subprocesses.
- **Startup configuration error:** Reject unknown adapters, duplicate source IDs, and zero enabled adapter instances; exit nonzero.
- **Unrecoverable stdout write error (including a broken pipe):** Exit nonzero. Shared-output backpressure follows ordinary stream behavior.
- **Graceful shutdown:** Stop polling and avoid intentionally writing incomplete JSON lines. Abrupt external termination cannot guarantee delivery of an in-progress record.

A source's observation failure does not invalidate successful observations from other sources. The monitor itself retains no last-known snapshot for publication.

## First adapter: Claude Code

The first adapter uses **`claude agents --json`** to obtain observations. It owns interpretation of the native response, including identifying native agents, validating the result, and translating statuses. The initial mapping is `busy → working`, `idle → idle`, and other or unrecognized statuses → `unknown` when the observation is otherwise valid.

**Implementation prerequisite:** Empirically verify that the command reports the active sessions the monitor needs to cover. Test foreground and background sessions, busy/idle/waiting states, no-session output, command failures, and execution time. If the source does not provide adequate coverage, revisit the Claude adapter strategy—not the core observation contract.

## Boundaries

**Monitor:** Scheduling, adapter execution, normalization, timestamping, publication, and operational error handling.

**Consumer, when needed:** Latest-known state, freshness thresholds, comparison/change detection, multi-source aggregation, storage, analytics, interfaces, and notifications. The stdout protocol carries observations only; polling configuration is obtained separately if a consumer needs it.

**Caller:** Adapter selection/configuration and monitor process supervision.

The MVP requires no internal snapshot cache, history, reconciler, freshness classifier, database, dashboard, or HTTP service.

## Implementation discretion

CLI option syntax, module layout, concurrency primitives, stdout serialization mechanism, signal-handling mechanics, and native-response edge cases are resolved during implementation, provided they preserve this contract and its boundaries.
