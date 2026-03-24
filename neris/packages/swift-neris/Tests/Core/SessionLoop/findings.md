---
date: 2026-03-24
model: opus-4.6
description: "Findings from the session-loop architecture proof-of-concept"
---

# Session Loop PoC Findings

Proof-of-concept validation of the session-loop architecture described in the design notes. All tests use scripted turns — no real LLM, UI, or network.

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
- Cancellation during escalation: `gate.wait()` returns `nil`, turn breaks without emitting remaining steps.

## Proven: REPL (outer loop)

- REPL reads from input stream, invokes turn closure, forwards turn output.
- Multiple inputs are processed sequentially — each turn completes before the next starts.
- `for await` over input stream gives the loop behavior for free.
- REPL does NOT relay control — that goes Router → AgentLoop directly.

## Proven: Router (stream decorator)

- Router wraps each UI event as `.repl` or `.control` based on a `() -> Bool` dependency.
- State changes between events are picked up correctly (both directions).
- Implementation is a single-line ternary per event — the Router classifies and directs, nothing else.
- Router is generic over input type — no knowledge of what events contain.
- The complexity lives in *who provides* `expectsControl`, not in the Router itself.

## Proven: StateEnvelope (stream-to-sync bridge)

- Envelope takes an `AsyncStream<Event>` and a reduce function, exposes `query() -> State` synchronously.
- Generic over both `Event` and `State` — the envelope doesn't know what state means.
- Default state is caller-provided via `initial` parameter.
- State survives stream termination — last reduced value is retained.
- Shared mutable state protected by `Mutex` (Synchronization framework).
- Wires directly to Router: `{ envelope.query() }` as `expectsControl` closure.
- Composition test proves envelope + router work together: stream state change flips routing.

## Key primitives

### Gate\<Response\>

Actor. Unbuffered, typed signaling between controller and turn.

- `wait() -> Response?` — suspends turn until response arrives. Returns `nil` on cancellation.
- `signal(_ response:)` — delivers response and resumes turn.
- `cancel()` / `isCancelled` — cooperative cancellation. Unblocks pending `wait()` with `nil`.

Unbuffered by design: signals sent before `wait()` are dropped.

### Router\<Input\>

Stream decorator. Wraps each event as `.repl(Input)` or `.control(Input)` based on an `expectsControl` closure. One line of logic.

### REPL\<Response\>

Outer loop. Reads input stream, invokes parameterized turn closure, forwards turn output to a single output stream.

### StateEnvelope\<Event, State\>

Stream-to-sync bridge. Consumes a stream, reduces each event to a `State` value via injected function, serves current state synchronously via `query()`. State protected by `Mutex`. Generic over both event and state types.

### InputChannel\<Input\>

Test helper. Generic wrapper around `AsyncStream.makeStream` for programmatic input delivery in tests.

### ScriptedTurn\<Response\>

Test double. Replays scripted steps (text, escalation) through `AsyncStream`. Suspends at escalations via Gate, checks cancellation between steps. Generic over response type.

### StreamSpy\<Element\>

Test observer for `AsyncStream`. Collects values, tracks completion, timeout-based waiting. Uses `ContinuousClock`.

## Lessons learned

- **AsyncStream buffers** — initial attempt used `AsyncStream<Void>` for control channel. Pre-sent signals were buffered. Replaced with `Gate` actor using `CheckedContinuation`.
- **Task cancellation races** — `Task.isCancelled` and `Task.yield()` don't guarantee visibility between synchronous steps. Actor-based cancellation with `Task.sleep` checkpoint is reliable.
- **Cancellation is a control signal** — flows through the same channel (Gate), not a side-channel Task kill.
- **Generic response boundary** — turn and gate are generic over response type. `ControlResponse` is test-scoped.
- **REPL does not relay control** — initial attempt to make REPL relay escalation responses was architecturally wrong. The design notes are explicit: control goes Router → AgentLoop directly. REPL handles task input only.
- **Router is trivially simple** — a boolean closure is sufficient to classify input. The Router doesn't need to know about agent states, escalation types, or control protocols. It just asks "expecting control?" and tags the event.

## Lessons learned (continued)

- **Mutex over NSLock in async contexts** — `NSLock.lock()` is unavailable from async contexts in Swift 6. `Mutex` from `Synchronization` framework works but requires macOS 15+ and `@unchecked Sendable` on the owning class (because `Mutex` is non-copyable and `Task` optional makes the class mutable).
- **Composition is trivially proven** — the envelope→router wiring test passed on first try with no new production code. When components have clean interfaces, integration tests confirm glue, not behavior.

## Not yet tested

- AgentLoop as stateful component — owns control stream, exposes observable state (idle/running/suspended)
- Full composition — REPL + Router + Envelope + AgentLoop wired together
- Turn protocol extraction
