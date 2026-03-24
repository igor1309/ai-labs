---
date: 2026-03-24
model: opus-4.6
description: "Findings from the session-loop turn primitive proof-of-concept"
---

# Session Loop PoC: Turn Primitive Findings

Proof-of-concept validation of the turn contract described in the design notes. All tests use scripted turns — no real LLM, UI, or network.

## Proven: all three turn outcomes

### Completion

Text output finishes without suspending. The stream completes naturally.

### Suspension and resumption

- Escalation suspends the turn. Stream stays open, no further output until control responds.
- Control response resumes the turn and is delivered to the stream.
- Remaining steps after escalation are emitted after resumption.
- Multiple escalations in a single turn suspend and resume sequentially.
- Pre-sent control signals (before the turn reaches escalation) are ignored — Gate is unbuffered.

### Cancellation

- Cancellation is a control signal, not Task cancellation.
- Turn checks `gate.isCancelled` between steps — actor hop as cooperative checkpoint.
- `Task.sleep` between steps models real async work, creating genuine suspension points.

## Key primitives

### Gate\<Response\>

Actor. Unbuffered, typed signaling between controller and turn.

- `wait()` — suspends turn until response arrives.
- `signal(_ response:)` — delivers response and resumes turn.
- `cancel()` / `isCancelled` — cooperative cancellation flag.

Unbuffered by design: signals sent before `wait()` are dropped.

### ScriptedTurn\<Response\>

Test double. Replays scripted steps (text, escalation) through `AsyncStream`. Suspends at escalations via Gate, checks cancellation between steps. Generic over response type.

### StreamSpy\<Element\>

Test observer for `AsyncStream`. Collects values, tracks completion, timeout-based waiting. Uses `ContinuousClock`.

## Lessons learned

- **AsyncStream buffers** — initial attempt used `AsyncStream<Void>` for control channel. Pre-sent signals were buffered. Replaced with `Gate` actor using `CheckedContinuation`.
- **Task cancellation races** — `Task.isCancelled` and `Task.yield()` don't guarantee visibility between synchronous steps. Actor-based cancellation with `Task.sleep` checkpoint is reliable.
- **Cancellation is a control signal** — flows through the same channel (Gate), not a side-channel Task kill.
- **Generic response boundary** — turn and gate are generic over response type. `ControlResponse` is test-scoped.

## Not yet tested

- Cancellation during escalation (`gate.wait()` hangs when cancel arrives)
- Session loop (REPL) — outer loop, lifecycle management
- Router — input classification based on agent loop state
- Turn protocol extraction
