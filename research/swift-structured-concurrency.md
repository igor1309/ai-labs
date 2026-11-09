# Swift Structured Concurrency — Current Guidance

Last reviewed: 2026-11-08

## Changes since last review

First review — no earlier version of this document existed. Baseline set against Swift 6.2 (shipped with Xcode 26).

## Core model

- **async/await** — suspension points are explicit (`await`); a function that never suspends should not be `async`.
- **Structured tasks** — `async let` and `withTaskGroup` / `withThrowingTaskGroup` / `withDiscardingTaskGroup` create child tasks bound to the parent scope. Children inherit priority and task-locals, are awaited before the scope exits, and are cancelled when the parent is cancelled or a throwing group throws. Prefer them over `Task {}`.
- **Unstructured tasks** — `Task {}` inherits the caller's actor isolation and priority; `Task.detached {}` inherits neither and should be rare. Keep a handle when the work must be cancellable; cancelling the handle is the only way to stop it.
- **Discarding task groups** (SE-0381) — use for long-lived fan-out (servers, event loops) where child results are not needed; they free child memory as children finish.

## Cancellation

- Cancellation is cooperative: it sets a flag. Code must check `Task.isCancelled` or call `try Task.checkCancellation()` at sensible points.
- `withTaskCancellationHandler` reacts immediately (e.g. to cancel a callback-based operation); the handler can run concurrently with the body on any thread, so it must be `Sendable` and thread-safe.
- `Task.sleep`, `AsyncStream` iteration and most system async APIs observe cancellation; `CheckedContinuation` does not — bridge it with a cancellation handler.
- Swift 6.2 adds `Task.isCancelled`-aware task naming and `Task.immediate` (SE-0472) for starting work synchronously on the current executor.

## Actors and isolation

- An actor serialises access to its state; every `await` inside an actor method is a reentrancy point — re-check invariants after it.
- Global actors (`@MainActor`) isolate types, functions or closures. Mark UI types `@MainActor`, not individual methods.
- `nonisolated` opts a member out of isolation; `isolated` parameters and `#isolation` (SE-0420) let a function run on the caller's actor.
- **Swift 6.2 "approachable concurrency"**:
  - SE-0461: `nonisolated async` functions now run on the caller's actor by default (`nonisolated(nonsending)`); use `@concurrent` to explicitly offload to the global concurrent executor. Enabled by the `NonisolatedNonsendingByDefault` upcoming feature (on under Xcode 26 "Approachable Concurrency").
  - SE-0466: default actor isolation per module — app targets can default to `@MainActor` (`defaultIsolation(MainActor.self)` in SwiftPM, Xcode 26 default for new app projects).
  - SE-0470: isolated conformances (`extension T: @MainActor P`).
  - Infer isolated closure/global-actor improvements (`InferIsolatedConformances`).

## Sendable and data-race safety

- Swift 6 language mode makes data-race checking an error. Swift 5 mode with `-strict-concurrency=complete` gives the same diagnostics as warnings — the recommended migration path, module by module.
- Value types with Sendable members are implicitly Sendable (non-public). Final classes with only immutable Sendable stored properties can conform to `Sendable` without `@unchecked`.
- Region-based isolation (SE-0414) and `sending` (SE-0430) let non-Sendable values cross isolation boundaries when the compiler can prove no aliasing remains — prefer these over `@unchecked Sendable`.
- `Mutex` (SE-0433, `Synchronization`, macOS 15 / iOS 18) is `Sendable` and non-copyable; a `final class` whose mutable state lives inside a `let` `Mutex` is `Sendable` with no `@unchecked`. `Atomic` covers single values. Never hold a lock across a suspension (`withLock` takes a synchronous closure, so it can't `await`); don't block inside tasks waiting on a lock another task holds long; for owning task lifecycles prefer an actor over a lock-guarded `Task?`.
- `NSLock.lock()/unlock()` are unavailable from async contexts (`noasync`); use `withLock {}`, or `Mutex`.
- `@preconcurrency import` silences Sendable diagnostics from modules not yet audited; use it narrowly and remove it once the dependency is annotated. `@unchecked Sendable` and `nonisolated(unsafe)` are last-resort escape hatches — document why each is safe.

## Practical rules (consolidated from sources)

1. Start structured (`async let`, task groups); reach for `Task {}` only at sync→async boundaries, and store the handle if lifetime matters.
2. Default UI and app code to `@MainActor`; move heavy work out with `@concurrent` functions, not `Task.detached`.
3. Treat each `await` in an actor as a point where state may have changed.
4. Check cancellation in loops and before expensive work.
5. Prefer `sending`/region isolation and value types over `@unchecked Sendable`.
6. Migrate with complete checking as warnings first, then flip modules to Swift 6 mode.
7. Test async code with Swift Testing (`confirmation`, async `#expect`) rather than sleeps.

## Sources

- Apple: [Swift Concurrency (The Swift Programming Language)](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/), [Migrating to Swift 6](https://www.swift.org/migration/documentation/migrationguide/), [Swift 6.2 release notes](https://www.swift.org/blog/swift-6.2-released/), [Approachable Concurrency vision](https://github.com/swiftlang/swift-evolution/blob/main/visions/approachable-concurrency.md)
- Swift Evolution: [SE-0381](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0381-task-group-discard-results.md), [SE-0414](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0414-region-based-isolation.md), [SE-0420](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0420-inheritance-of-actor-isolation.md), [SE-0430](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0430-transferring-parameters-and-results.md), [SE-0433](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0433-mutex.md), [SE-0461](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0461-async-function-isolation.md), [SE-0466](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0466-control-default-actor-isolation.md), [SE-0470](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0470-isolated-conformances.md), [SE-0472](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0472-task-start-synchronously-on-caller-context.md)
- Swift Forums: [Using Swift — concurrency](https://forums.swift.org/c/swift-users/15)
- Antoine van der Lee: [Swift Concurrency course/articles](https://www.avanderlee.com/category/concurrency/), [Swift Concurrency Agent Skill](https://github.com/AvdLee/Swift-Concurrency-Agent-Skill)
- Majid Jabrayilov: [swiftwithmajid.com](https://swiftwithmajid.com/)
- Matt Massicotte: [massicotte.org](https://www.massicotte.org/) (isolation deep dives)

## Repo docs corrected in this review

| File | Claim | Correction |
|---|---|---|
| `dev-skills/public/swift-package-manifest/SKILL.md`, `references/pattern-details.md` | Swift 6 manifests should use `@preconcurrency import PackageDescription` | Not needed: manifest top-level code is main-actor isolated and `swift package init` (tools 6.x) emits a plain `import PackageDescription`. `@preconcurrency` is only for unaudited dependencies. |
| `neris/packages/swift-neris/Tests/Core/SessionLoop/findings.md` | Using `Mutex` requires `@unchecked Sendable` on the owning class | `Mutex` is `Sendable`, so state inside a `let` `Mutex` doesn't force `@unchecked`. For managing a `Task?` lifecycle, an actor is usually the clearer design. |
