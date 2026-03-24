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

### REPL\<Input, Event\>

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

## Proven: AgentLoop protocol and composition

### AgentLoop\<Input, Event\>

Protocol with primary associated types. Single requirement: `run(input:) -> AsyncStream<Event>`.

- `AgentLoop.compose(input:)` — extension that creates a REPL wired to the agent loop. This is the basic composition: input stream → turn → event stream.
- Tests prove events flow through and inputs reach the agent loop.

### ControllableAgentLoop\<Control\>: AgentLoop

Extends AgentLoop with `start(observing: AsyncStream<Control>)` for control stream delivery.

- `ControllableAgentLoop.compose(uiEvents:initial:map:)` — full composition wiring:
  1. Splits router output into repl and control continuations (single iteration)
  2. Uses `AgentLoop.compose` for the repl path (reuses REPL)
  3. Feeds repl output to StateEnvelope (drives routing state)
  4. Routes control events to `start(observing:)`
- Constraint: `Control == Input` — UI sends one event type routed to both paths.
- Test proves control events delivered to agent loop through the full Router → control stream path.

### Design decisions

- **Two compose levels** — `AgentLoop.compose` returns REPL. `ControllableAgentLoop.compose` builds on it, adding Router + Envelope + control. Each protocol owns its composition.
- **compose produces its own event stream** — the agent loop generates events via `run(input:)` internally. No external event stream parameter needed — the loop IS the event source.
- **Bool state is correct** — routing decision is binary (control vs input). Generic State would add complexity with no purpose.

## Lessons learned (continued)

- **Mutex over NSLock in async contexts** — `NSLock.lock()` is unavailable from async contexts in Swift 6. `Mutex` from `Synchronization` framework works but requires macOS 15+ and `@unchecked Sendable` on the owning class (because `Mutex` is non-copyable and `Task` optional makes the class mutable).
- **Composition is trivially proven** — the envelope→router wiring test passed on first try with no new production code. When components have clean interfaces, integration tests confirm glue, not behavior.
- **compose must own its event stream** — early version passed `events: AsyncStream<Event>` as a parameter, asking the caller to hand the agent loop its own output back. The agent loop produces events via `run(input:)` — compose should wire that internally, not receive it from outside.
- **Reuse primitives in composition** — compose initially reimplemented REPL's turn iteration inline. The fix: call `AgentLoop.compose` (which returns REPL) and let REPL handle the turn loop. The routing Task only splits router output into two continuations.

## Not yet tested

- Turn protocol extraction
