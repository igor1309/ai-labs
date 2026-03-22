# MessageStore Extraction Design Note

## Context

`AgentLoop` is currently a Swift `actor` whose sole mutable state is a private
`[Message]` array. Actor isolation was the mechanism protecting that array from
concurrent access.

## Problem

Keeping messages as private state inside `AgentLoop` blocks three desirable
capabilities:

1. **Session persistence** — no hook point to write history to disk.
2. **Conversation compaction** — no way to summarise or trim old messages
   without touching `AgentLoop` internals.
3. **Testability** — the message array cannot be inspected or seeded from
   outside the actor.

Attempting to fix this by making `MessageStore` an `actor` protocol introduces
a worse problem: every `await store.append()` call inside `AgentLoop` is a
suspension point. Because Swift actors are re-entrant by default, another
`process()` call can be scheduled between an `append` and the following
`respond`, leaving message history in an inconsistent state mid-loop.

## Decision

Extract messages into a concrete `MessageStore` class that uses `NSLock` for
internal synchronisation. All access from `AgentLoop` is **synchronous** — no
suspension point, no re-entrancy window.

```swift
final class MessageStore: @unchecked Sendable {
    private var messages: [AgentLoop.Message] = []
    private let lock = NSLock()

    func append(_ message: AgentLoop.Message) {
        lock.withLock { messages.append(message) }
    }

    func all() -> [AgentLoop.Message] {
        lock.withLock { messages }
    }
}
```

`NSLock` is the right primitive here precisely because synchronous access
prevents the re-entrancy gap that an actor-based store would reintroduce.

## Consequences for AgentLoop

With all mutable state moved to `MessageStore`, `AgentLoop` carries no state of
its own. It becomes a plain `final class: Sendable` — the actor designation is
no longer needed. The `isProcessing` guard also moves out, since it was
protecting the same state.

```swift
public final class AgentLoop: Sendable {
    private let respond: Respond
    private let execute: Execute
    private let store: MessageStore
}
```

## Composition

The synchronous contract of `MessageStore` makes decorator composition
straightforward without any changes to `AgentLoop`:

```
MessageStore (NSLock, owns [Message])
    ↑ wrapped by
PersistingMessageStore   — write-through to disk on each append
CompactingMessageStore   — summarises tail when count exceeds threshold
    ↑ injected into
AgentLoop (stateless, pure loop logic)
    ↑ injected into
NerisAgent (wires HTTP client + store + loop)
```

Each decorator honours the same synchronous interface. Persistence and
compaction are added without modifying `AgentLoop`.

## Resulting Shape

| Layer | Type | Responsibility |
|---|---|---|
| `MessageStore` | `final class` + `NSLock` | Thread-safe message history |
| `PersistingMessageStore` | decorator | Session persistence |
| `CompactingMessageStore` | decorator | Conversation compaction |
| `AgentLoop` | `final class: Sendable` | Loop logic only, stateless |
| `NerisAgent` | `final class: Sendable` | Composition root |
