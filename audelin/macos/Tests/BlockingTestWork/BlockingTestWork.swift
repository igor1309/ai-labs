import Dispatch

// Test fixtures read and write files and launch processes, which block; the
// cooperative pool must not run them, so tests await them on this queue.
private let blockingWork = DispatchQueue(label: "audelin.tests.blocking", attributes: .concurrent)

/// Runs blocking test work outside the cooperative pool and awaits its result.
public func offPool<Value: Sendable>(_ work: @escaping @Sendable () throws -> Value) async throws -> Value {

    try await withCheckedThrowingContinuation { (done: CheckedContinuation<Value, any Error>) in
        blockingWork.async { done.resume(with: Result { try work() }) }
    }
}

/// Runs blocking test work that cannot fail outside the cooperative pool.
public func offPool<Value: Sendable>(_ work: @escaping @Sendable () -> Value) async -> Value {

    await withCheckedContinuation { (done: CheckedContinuation<Value, Never>) in
        blockingWork.async { done.resume(returning: work()) }
    }
}

/// Queues blocking cleanup without waiting, for `defer`, which cannot await;
/// as a barrier it runs before any blocking work submitted after it.
public func afterwards(_ work: @escaping @Sendable () -> Void) {

    blockingWork.async(flags: .barrier, execute: work)
}
