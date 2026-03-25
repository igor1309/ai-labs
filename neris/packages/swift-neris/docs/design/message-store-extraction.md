---
date: 2026-03-22
model: claude-opus-4-6
description: "Extract message history from ToolUseLoop into a synchronous MessageStore"
---

# MessageStore Extraction

## Context

`ToolUseLoop` is currently a Swift `actor` whose sole mutable state is a private
`[Message]` array. Actor isolation was the mechanism protecting that array from
concurrent access.

## Problem

Keeping messages as private state inside `ToolUseLoop` blocks three desirable
capabilities:

1. **Session persistence** — no hook point to write history to disk.
2. **Conversation compaction** — no way to summarise or trim old messages
   without touching `ToolUseLoop` internals.
3. **Testability** — the message array cannot be inspected or seeded from
   outside the actor.

Attempting to fix this by making `MessageStore` an `actor` protocol introduces
a worse problem: every `await store.append()` call inside `ToolUseLoop` is a
suspension point. Because Swift actors are re-entrant by default, another
`process()` call can be scheduled between an `append` and the following
`respond`, leaving message history in an inconsistent state mid-loop.

## Decision

Extract messages into a concrete `MessageStore` that uses `Mutex` for internal
synchronisation. All access from `ToolUseLoop` is **synchronous** — no
suspension point, no re-entrancy window.

`Mutex` is the right primitive — synchronous access prevents the re-entrancy
gap that an actor-based store would reintroduce. `Mutex` is preferred over
`NSLock` as it is available from async contexts in Swift 6 and is the same
primitive used by `StateEnvelope`.

## Consequences

- `MessageStore` owns all mutable state. `ToolUseLoop` becomes stateless —
  a plain `final class: Sendable`, no longer an actor.
- The `isProcessing` guard moves out of `ToolUseLoop` since it was protecting
  the same state.
- The synchronous contract enables decorator composition: persistence and
  compaction layers wrap `MessageStore` without modifying `ToolUseLoop`.

## Resulting Shape

| Layer | Responsibility |
|---|---|
| `MessageStore` | Thread-safe message history (`Mutex`) |
| `PersistingMessageStore` | Write-through to disk on each append |
| `CompactingMessageStore` | Summarise tail when count exceeds threshold |
| `ToolUseLoop` | Loop logic only, stateless |
| `NerisAgent` | Composition root |

---

## Implementation Notes

> Drop this section after implementation.

### MessageStore

```swift
import Synchronization

final class MessageStore: @unchecked Sendable {
    private let messages: Mutex<[ToolUseLoop.Message]> = Mutex([])

    func append(_ message: ToolUseLoop.Message) {
        messages.withLock { $0.append(message) }
    }

    func all() -> [ToolUseLoop.Message] {
        messages.withLock { $0 }
    }
}
```

### ToolUseLoop after extraction

```swift
public final class ToolUseLoop: Sendable {
    private let respond: Respond
    private let execute: Execute
    private let store: MessageStore
}
```

### Composition diagram

```
MessageStore (Mutex, owns [Message])
    ↑ wrapped by
PersistingMessageStore   — write-through to disk on each append
CompactingMessageStore   — summarises tail when count exceeds threshold
    ↑ injected into
ToolUseLoop (stateless, pure loop logic)
    ↑ injected into
NerisAgent (wires HTTP client + store + loop)
```
