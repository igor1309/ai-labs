---
date: 2025-03-25
model: claude-opus-4-6
description: "Promote SessionLoop PoC types from tests to production, replacing Loop/FilterResult"
---

# Promote SessionLoop Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote five generic primitives (REPL, Gate, Router, StateEnvelope) and two protocols (AgentLoop, ControllableAgentLoop) from the SessionLoop PoC test suite to production Sources/Core, replacing the current Loop/FilterResult types.

**Architecture:** The SessionLoop PoC proves a bidirectional agent session architecture through isolated tests. Each primitive is generic, stream-based, and independently testable. Promotion moves type definitions from test files to Sources/Core with `public` visibility, then removes the test-local definitions. The current `AgentLoop` actor is renamed to `ToolUseLoop` to free the name for the protocol. CLI is rewired from `Loop` to `REPL`.

**Tech Stack:** Swift 6.2, Swift Testing, AsyncStream, Synchronization (Mutex)

---

## File Structure

### New files (Sources/Core)
| File | Contents | Responsibility |
|------|----------|----------------|
| `Sources/Core/REPL.swift` | `REPL<Input, Event>` struct | Generic input loop: reads input stream, runs turn per input, forwards output |
| `Sources/Core/Gate.swift` | `Gate<Response>` actor | Unbuffered cooperative suspend/resume signaling for escalations |
| `Sources/Core/Router.swift` | `Router<Input>` struct + `RouterEvent<Input>` enum | State-aware input demultiplexer (repl vs control) |
| `Sources/Core/StateEnvelope.swift` | `StateEnvelope<Event, State>` class | Async-to-sync bridge: reduces event stream to queryable state via Mutex |

### Renamed files (Sources/Core)
| Before | After | Why |
|--------|-------|-----|
| `Sources/Core/AgentLoop.swift` | `Sources/Core/ToolUseLoop.swift` | Frees `AgentLoop` name for the protocol; actor is a specific tool-use implementation |

### New protocol file (Sources/Core)
| File | Contents |
|------|----------|
| `Sources/Core/AgentLoop.swift` | `AgentLoop` protocol + `compose(input:)` extension, `ControllableAgentLoop` protocol + `compose(uiEvents:initial:map:)` extension |

### Deleted files
| File | Why |
|------|-----|
| `Sources/Core/Loop.swift` | Replaced by `REPL` |
| `Sources/Core/FilterResult.swift` | Was only used by `Loop`; filtering is now the caller's concern |
| `Tests/Core/LoopTests.swift` | Tests for deleted `Loop` |
| `Tests/Core/FilterResultTests.swift` | Tests for deleted `FilterResult` |

### Modified test files
| File | Change |
|------|--------|
| `Tests/Core/SessionLoop/SessionLoopTests.swift` | Add `@testable import NerisCore`, remove local `REPL` and `Gate` definitions |
| `Tests/Core/SessionLoop/RouterTests.swift` | Add `@testable import NerisCore`, remove local `Router` and `RouterEvent` definitions |
| `Tests/Core/SessionLoop/StateEnvelopeTests.swift` | Add `@testable import NerisCore`, remove local `StateEnvelope` definition |
| `Tests/Core/SessionLoop/CompositionTests.swift` | Add `@testable import NerisCore`, remove local `REPL`, `Router`, `RouterEvent`, `StateEnvelope`, protocol definitions; keep spy classes |
| `Tests/Core/AgentLoopTests.swift` | Update `AgentLoop` → `ToolUseLoop` references |
| `Tests/Core/API/OpenRouter/OpenRouterMessageAdapterTests.swift` | Update `AgentLoop.*` → `ToolUseLoop.*` references |
| `Tests/Core/API/OpenRouter/OpenRouterResponseAdapterTests.swift` | Update `AgentLoop.Response` → `ToolUseLoop.Response` |
| `Sources/CLI/NerisCLI.swift` | Rewire from `Loop` to `REPL` |
| `Sources/Core/NerisAgent.swift` | Update `AgentLoop` → `ToolUseLoop` reference |

---

## Task 1: Promote REPL to Sources/Core

**Files:**
- Create: `Sources/Core/REPL.swift`
- Modify: `Tests/Core/SessionLoop/SessionLoopTests.swift`

- [ ] **Step 1: Create Sources/Core/REPL.swift**

Move the struct from `SessionLoopTests.swift:245-264` to production. Add `public` visibility:

```swift
public struct REPL<Input: Sendable, Event: Sendable> {

    public let input: AsyncStream<Input>
    public let turn: @Sendable (Input) -> AsyncStream<Event>

    public init(input: AsyncStream<Input>, turn: @escaping @Sendable (Input) -> AsyncStream<Event>) {
        self.input = input
        self.turn = turn
    }

    public func run() -> AsyncStream<Event> {
        let input = input
        let turn = turn
        return AsyncStream { continuation in
            Task {
                for await message in input {
                    for await output in turn(message) {
                        continuation.yield(output)
                    }
                }
                continuation.finish()
            }
        }
    }
}
```

- [ ] **Step 2: Update SessionLoopTests.swift**

Add `@testable import NerisCore` at top. Remove the `REPL` struct definition (lines 245-264). Keep `TurnOutput`, `ScriptedTurn`, `Gate` — those are test-local for now.

- [ ] **Step 3: Add import to CompositionTests.swift**

Add `@testable import NerisCore` at top of `CompositionTests.swift`. This is needed now because `REPL` was previously visible across the test module from SessionLoopTests.swift. The local protocol extensions in CompositionTests.swift reference `REPL`, `Router`, `RouterEvent`, and `StateEnvelope` — all of which will be promoted in subsequent tasks and need the import to resolve from NerisCore.

- [ ] **Step 4: Run tests**

Run: `swift test 2>&1 | xcsift --quiet`
Expected: All 22 SessionLoop tests pass, plus all existing tests.

- [ ] **Step 4: Commit**

```
git add neris/packages/swift-neris/Sources/Core/REPL.swift neris/packages/swift-neris/Tests/Core/SessionLoop/SessionLoopTests.swift neris/packages/swift-neris/Tests/Core/SessionLoop/CompositionTests.swift
git commit -m "promote REPL to Sources/Core"
```

---

## Task 2: Promote Gate to Sources/Core

**Files:**
- Create: `Sources/Core/Gate.swift`
- Modify: `Tests/Core/SessionLoop/SessionLoopTests.swift`

- [ ] **Step 1: Create Sources/Core/Gate.swift**

Move the actor from `SessionLoopTests.swift:223-243`. Add `public` visibility:

```swift
public actor Gate<Response: Sendable> {

    private var continuation: CheckedContinuation<Response?, Never>?
    public private(set) var isCancelled = false

    public init() {}

    public func wait() async -> Response? {
        if isCancelled { return nil }
        return await withCheckedContinuation { continuation = $0 }
    }

    public func signal(_ response: Response) {
        continuation?.resume(returning: response)
        continuation = nil
    }

    public func cancel() {
        isCancelled = true
        continuation?.resume(returning: nil)
        continuation = nil
    }
}
```

- [ ] **Step 2: Update SessionLoopTests.swift**

Remove the `private actor Gate` definition (lines 223-243). The existing tests already use `Gate` — now resolved from NerisCore.

- [ ] **Step 3: Run tests**

Run: `swift test 2>&1 | xcsift --quiet`
Expected: PASS

- [ ] **Step 4: Commit**

```
git add neris/packages/swift-neris/Sources/Core/Gate.swift neris/packages/swift-neris/Tests/Core/SessionLoop/SessionLoopTests.swift
git commit -m "promote Gate to Sources/Core"
```

---

## Task 3: Promote Router + RouterEvent to Sources/Core

**Files:**
- Create: `Sources/Core/Router.swift`
- Modify: `Tests/Core/SessionLoop/RouterTests.swift`

- [ ] **Step 1: Create Sources/Core/Router.swift**

Move from `RouterTests.swift:73-95`. Add `public` visibility:

```swift
public enum RouterEvent<Input: Equatable & Sendable>: Equatable, Sendable {
    case repl(Input)
    case control(Input)
}

public struct Router<Input: Equatable & Sendable> {

    public let events: AsyncStream<Input>
    public let expectsControl: @Sendable () -> Bool

    public init(events: AsyncStream<Input>, expectsControl: @escaping @Sendable () -> Bool) {
        self.events = events
        self.expectsControl = expectsControl
    }

    public func run() -> AsyncStream<RouterEvent<Input>> {
        let events = events
        let expectsControl = expectsControl
        return AsyncStream { continuation in
            Task {
                for await event in events {
                    continuation.yield(expectsControl() ? .control(event) : .repl(event))
                }
                continuation.finish()
            }
        }
    }
}
```

- [ ] **Step 2: Update RouterTests.swift**

Add `@testable import NerisCore` at top. Remove local `RouterEvent` enum (lines 73-76) and `Router` struct (lines 78-95).

- [ ] **Step 3: Run tests**

Run: `swift test 2>&1 | xcsift --quiet`
Expected: PASS — Router tests + StateEnvelope integration test (which uses Router) both pass.

- [ ] **Step 4: Commit**

```
git add neris/packages/swift-neris/Sources/Core/Router.swift neris/packages/swift-neris/Tests/Core/SessionLoop/RouterTests.swift
git commit -m "promote Router and RouterEvent to Sources/Core"
```

---

## Task 4: Promote StateEnvelope to Sources/Core

**Files:**
- Create: `Sources/Core/StateEnvelope.swift`
- Modify: `Tests/Core/SessionLoop/StateEnvelopeTests.swift`

- [ ] **Step 1: Create Sources/Core/StateEnvelope.swift**

Move from `StateEnvelopeTests.swift:100-119`. Add `public` visibility:

```swift
import Synchronization

public final class StateEnvelope<Event: Sendable, State: Sendable>: @unchecked Sendable {

    private let state: Mutex<State>
    private var task: Task<Void, Never>?

    public init(initial: State, stream: AsyncStream<Event>, map: @escaping @Sendable (Event) -> State) {
        state = Mutex(initial)
        task = Task { [weak self] in
            for await event in stream {
                self?.state.withLock { $0 = map(event) }
            }
        }
    }

    public func query() -> State {
        state.withLock { $0 }
    }

    deinit { task?.cancel() }
}
```

- [ ] **Step 2: Update StateEnvelopeTests.swift**

Add `@testable import NerisCore` at top. Remove `import Synchronization`. Remove local `StateEnvelope` class (lines 100-119).

- [ ] **Step 3: Run tests**

Run: `swift test 2>&1 | xcsift --quiet`
Expected: PASS

- [ ] **Step 4: Commit**

```
git add neris/packages/swift-neris/Sources/Core/StateEnvelope.swift neris/packages/swift-neris/Tests/Core/SessionLoop/StateEnvelopeTests.swift
git commit -m "promote StateEnvelope to Sources/Core"
```

---

## Task 5: Rename AgentLoop actor to ToolUseLoop

**Files:**
- Rename: `Sources/Core/AgentLoop.swift` → `Sources/Core/ToolUseLoop.swift`
- Modify: `Tests/Core/AgentLoopTests.swift`
- Modify: `Sources/Core/NerisAgent.swift`
- Modify: `Sources/Core/API/OpenRouter/OpenRouterAdapters.swift`
- Modify: `Tests/Core/API/OpenRouter/OpenRouterMessageAdapterTests.swift`
- Modify: `Tests/Core/API/OpenRouter/OpenRouterResponseAdapterTests.swift`
- Modify: `Sources/CLI/NerisCLI.swift`

- [ ] **Step 1: Rename file and type**

Rename `Sources/Core/AgentLoop.swift` to `Sources/Core/ToolUseLoop.swift`. Inside, rename `actor AgentLoop` → `actor ToolUseLoop`. All nested types (`ToolCall`, `Event`, `Message`, `Response`, `ConcurrentAccessError`, `EventStream`, `Respond`, `Execute`) stay nested under `ToolUseLoop`.

- [ ] **Step 2: Update NerisAgent.swift**

Replace all `AgentLoop` references with `ToolUseLoop`:
- `private let agentLoop: ToolUseLoop`
- `self.agentLoop = ToolUseLoop(`
- `public func process(_ input: String) async -> AsyncThrowingStream<ToolUseLoop.Event, Error>`

- [ ] **Step 3: Update OpenRouterAdapters.swift**

Replace all `AgentLoop.Message` → `ToolUseLoop.Message`, `AgentLoop.Response` → `ToolUseLoop.Response`, `AgentLoop.ToolCall` → `ToolUseLoop.ToolCall`.

- [ ] **Step 4: Update NerisCLI.swift**

Replace `AgentLoop.Event` → `ToolUseLoop.Event` in the event switch.

- [ ] **Step 5: Update AgentLoopTests.swift**

Replace all `AgentLoop` → `ToolUseLoop` in typealias and references. Keep the test file name — it tests the tool-use loop behavior which hasn't changed.

- [ ] **Step 6: Update OpenRouterMessageAdapterTests.swift**

Replace `AgentLoop.ToolCall` → `ToolUseLoop.ToolCall` (line 24), `AgentLoop.Message` → `ToolUseLoop.Message` (lines 48, 55).

- [ ] **Step 7: Update OpenRouterResponseAdapterTests.swift**

Replace `AgentLoop.Response` → `ToolUseLoop.Response` (line 37).

- [ ] **Step 8: Run tests**

Run: `swift test 2>&1 | xcsift --quiet`
Expected: PASS — all existing tests pass with the rename.

- [ ] **Step 9: Commit**

```
git add neris/packages/swift-neris/Sources/Core/ToolUseLoop.swift neris/packages/swift-neris/Sources/Core/NerisAgent.swift neris/packages/swift-neris/Sources/Core/API/OpenRouter/OpenRouterAdapters.swift neris/packages/swift-neris/Sources/CLI/NerisCLI.swift neris/packages/swift-neris/Tests/Core/AgentLoopTests.swift neris/packages/swift-neris/Tests/Core/API/OpenRouter/OpenRouterMessageAdapterTests.swift neris/packages/swift-neris/Tests/Core/API/OpenRouter/OpenRouterResponseAdapterTests.swift
git rm neris/packages/swift-neris/Sources/Core/AgentLoop.swift
git commit -m "rename AgentLoop actor to ToolUseLoop"
```

---

## Task 6: Promote AgentLoop and ControllableAgentLoop protocols to Sources/Core

**Files:**
- Create: `Sources/Core/AgentLoop.swift` (reuses the freed filename)
- Modify: `Tests/Core/SessionLoop/CompositionTests.swift`

- [ ] **Step 1: Create Sources/Core/AgentLoop.swift with both protocols and extensions**

Move from `CompositionTests.swift:138-185`. Add `public` visibility:

```swift
public protocol AgentLoop<Input, Event> {
    associatedtype Input: Sendable
    associatedtype Event: Sendable
    func run(input: Input) -> AsyncStream<Event>
}

extension AgentLoop where Self: Sendable {

    public func compose(input: AsyncStream<Input>) -> REPL<Input, Event> {
        REPL(input: input, turn: { self.run(input: $0) })
    }
}

public protocol ControllableAgentLoop<Control>: AgentLoop {
    associatedtype Control: Sendable
    func start(observing: AsyncStream<Control>)
}

extension ControllableAgentLoop where Control == Input, Control: Equatable, Self: Sendable {

    public func compose(
        uiEvents: AsyncStream<Control>,
        initial: Bool = false,
        map: @escaping @Sendable (Event) -> Bool
    ) -> StateEnvelope<Event, Bool> {
        let (replStream, replContinuation) = AsyncStream.makeStream(of: Control.self)
        let (controlStream, controlContinuation) = AsyncStream.makeStream(of: Control.self)

        let repl = compose(input: replStream)
        let envelope = StateEnvelope(initial: initial, stream: repl.run(), map: map)
        let router = Router(events: uiEvents, expectsControl: { envelope.query() })

        start(observing: controlStream)

        Task {
            for await routerEvent in router.run() {
                switch routerEvent {
                case .repl(let input): replContinuation.yield(input)
                case .control(let control): controlContinuation.yield(control)
                }
            }
            replContinuation.finish()
            controlContinuation.finish()
        }

        return envelope
    }
}
```

- [ ] **Step 2: Update CompositionTests.swift**

Add `@testable import NerisCore` at top. Remove local protocol definitions (`AgentLoop`, `ControllableAgentLoop`) and their extensions (lines 138-185). Keep spy classes (`AgentLoopSpy`, `ControllableAgentLoopSpy`) — they are test doubles.

- [ ] **Step 3: Run tests**

Run: `swift test 2>&1 | xcsift --quiet`
Expected: PASS

- [ ] **Step 4: Commit**

```
git add neris/packages/swift-neris/Sources/Core/AgentLoop.swift neris/packages/swift-neris/Tests/Core/SessionLoop/CompositionTests.swift
git commit -m "promote AgentLoop and ControllableAgentLoop protocols to Sources/Core"
```

---

## Task 7: Delete Loop and FilterResult

**Files:**
- Delete: `Sources/Core/Loop.swift`
- Delete: `Sources/Core/FilterResult.swift`
- Delete: `Tests/Core/LoopTests.swift`
- Delete: `Tests/Core/FilterResultTests.swift`

- [ ] **Step 1: Update NerisCLI to use REPL instead of Loop**

Replace the `Loop`-based iteration in `NerisCLI.swift` with `REPL`. The CLI currently uses `Loop(inputReader:processor:)` which combines read-filter-process. With REPL, filtering (quit/skip) moves to the CLI layer explicitly:

```swift
func run() async throws {
    guard let apiKey = ProcessInfo.processInfo.environment["OPENROUTER_API_KEY"] else {
        print("error: OPENROUTER_API_KEY not set")
        return
    }
    let agent = NerisAgent(config: .init(
        apiKey: apiKey,
        model: "nvidia/nemotron-3-super-120b-a12b:free",
        systemPrompt: "You are neris, a helpful assistant. Be concise."
    ))
    let spinner = Spinner()
    let (inputStream, inputContinuation) = AsyncStream.makeStream(of: String.self)
    let repl = REPL<String, ToolUseLoop.Event>(input: inputStream) { input in
        spinner.start()
        return AsyncStream { continuation in
            Task {
                do {
                    for try await event in await agent.process(input) {
                        continuation.yield(event)
                    }
                } catch {
                    spinner.stop()
                    print("error: \(error.localizedDescription)")
                }
                continuation.finish()
            }
        }
    }
    print("neris v\(Self.configuration.version)")
    Task {
        for await event in repl.run() {
            spinner.stop()
            switch event {
            case .text(let text): print(text)
            case .toolCall(let call): print("tool: \(call.name)")
            case .toolResult(let result): print("result: \(result)")
            }
        }
    }
    while true {
        print("neris> ", terminator: "")
        guard let line = readLine() else { break }
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { continue }
        if ["exit", "quit", "q"].contains(trimmed.lowercased()) { break }
        inputContinuation.yield(trimmed)
    }
    inputContinuation.finish()
}
```

Note: The error-retry behavior from the old `Loop`-based code is preserved — errors within a turn are caught inside the REPL's turn closure, printed, and the REPL continues accepting the next input. The `"neris> "` prompt is preserved in the read loop.

- [ ] **Step 2: Run tests to verify CLI compiles**

Run: `swift build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Delete obsolete files**

Delete `Sources/Core/Loop.swift`, `Sources/Core/FilterResult.swift`, `Tests/Core/LoopTests.swift`, `Tests/Core/FilterResultTests.swift`.

- [ ] **Step 4: Run tests**

Run: `swift test 2>&1 | xcsift --quiet`
Expected: PASS — Loop/FilterResult tests no longer exist, all remaining tests pass.

- [ ] **Step 5: Commit**

```
git rm neris/packages/swift-neris/Sources/Core/Loop.swift neris/packages/swift-neris/Sources/Core/FilterResult.swift neris/packages/swift-neris/Tests/Core/LoopTests.swift neris/packages/swift-neris/Tests/Core/FilterResultTests.swift
git add neris/packages/swift-neris/Sources/CLI/NerisCLI.swift
git commit -m "replace Loop/FilterResult with REPL, delete obsolete types and tests"
```

---

## Task 8: Final cleanup and verification

- [ ] **Step 1: Verify all SessionLoop test files import NerisCore**

Check that `SessionLoopTests.swift`, `RouterTests.swift`, `StateEnvelopeTests.swift`, `CompositionTests.swift` all have `@testable import NerisCore` and no local production type definitions remain.

- [ ] **Step 2: Run full test suite**

Run: `swift test 2>&1 | xcsift --quiet`
Expected: PASS

- [ ] **Step 3: Run build**

Run: `swift build 2>&1 | tail -5`
Expected: Build succeeds with no warnings about the promoted types.

- [ ] **Step 4: Commit any remaining cleanup**

Only if Step 1 found issues. Otherwise skip.

---

## Execution Lock

- Worktree required: yes
- Expected worktree: `worktrees/promote-session-loop`
- Expected branch: `codex/promote-session-loop`
- Preflight check: [ ] done
