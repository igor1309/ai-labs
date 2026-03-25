---
date: 2026-03-25
model: claude-opus-4-6
description: "Extract message state from ToolUseLoop into an injected Store protocol"
---

# MessageStore Extraction

## Context

`ToolUseLoop` is currently a Swift `actor` whose sole mutable state is a private
`[Message]` array. Actor isolation protects that array from concurrent access.

## Problem

Keeping messages as private state inside `ToolUseLoop` blocks three capabilities:

1. **Session persistence** — no hook point to write history to disk.
2. **Conversation compaction** — no way to summarise or trim old messages
   without touching `ToolUseLoop` internals.
3. **Testability** — the message array cannot be inspected or seeded from
   outside the actor.

Making `MessageStore` an `actor` protocol would be worse: every `await store.append()`
is a suspension point, and Swift actors are re-entrant by default — another
`process()` call can be scheduled between an `append` and the following `respond`,
leaving message history in an inconsistent state mid-loop.

## Decisions

1. **`ToolUseLoop` owns a `Store` protocol** with `append` and a read-all method.
   This is the loop's declared interface — what it needs, not how it's fulfilled.
2. **`InMemoryStore<Message>` conforms to `Store`** at the composition layer.
   The loop does not know the concrete type.
3. **`ToolUseLoop` becomes `final class: Sendable`**, no longer an actor.
   All store access is synchronous via `Mutex` — no suspension point, no
   re-entrancy window.
4. **`isProcessing` guard is dropped.** The session layer already serializes access.
5. **No decorator stores.** `PersistingMessageStore`, `CompactingMessageStore`,
   etc. get their own design docs when needed.
6. **No new `ToolUseLoop` tests.** Existing tests verify the behavioral contract
   through `respond.payloads`. Store population and seeding are composition
   concerns.
7. **`record` helper stays** as an internal method that calls `store.append` on
   success or appends `.error` on failure.

## Resulting Shape

| Layer | Responsibility |
|---|---|
| `ToolUseLoop.Store` | Protocol owned by `ToolUseLoop` — append + read-all |
| `InMemoryStore` | Existing generic, conforms to `Store` at composition |
| `ToolUseLoop` | `final class: Sendable`, stateless loop logic |
| `NerisAgent` | Wires `InMemoryStore<Message>` into the loop |

## Implementation Steps

> Drop this section after implementation.

1. Add `Store` protocol to `ToolUseLoop` (append + read-all).
2. Add `Store` parameter to `init` with a default `NullStore()` (actors
   cannot have convenience inits) so existing clients and tests stay green.
3. TDD store calls via spy: append on respond success, append on execute
   success, append `.error` on failure.
4. Once green — drop `messages` array, drop `isProcessing`, change `actor`
   to `final class: Sendable`, switch `respond` to read from store.
5. Conform `InMemoryStore` to `Store`, wire in `NerisAgent`, remove
   default `NullStore` parameter.
