import Foundation
import Synchronization

/// A first-come turn whose waiters suspend and can leave the queue on cancellation.
final class Turn: Sendable {
    private struct Waiter {
        let id: UUID
        let output: AsyncStream<Void>.Continuation
    }
    private struct State {
        var taken = false
        var waiting: [Waiter] = []
    }
    private let state = Mutex(State())
    private let admitted: @Sendable (Bool) -> Void
    init(admitted: @escaping @Sendable (Bool) -> Void) { self.admitted = admitted }

    func take() async throws {
        try Task.checkCancellation()
        let id = UUID(), signal = AsyncStream<Void>.makeStream()
        let granted = state.withLock { state in
            if state.taken {
                state.waiting.append(.init(id: id, output: signal.continuation))
                return false
            }
            state.taken = true
            return true
        }
        admitted(granted)
        if granted { signal.continuation.yield(()); signal.continuation.finish() }
        var arrival = signal.stream.makeAsyncIterator()
        let acquired = await arrival.next() != nil
        if !acquired || Task.isCancelled {
            let queued = state.withLock { state in
                guard let index = state.waiting.firstIndex(where: { $0.id == id }) else { return false }
                state.waiting.remove(at: index).output.finish()
                return true
            }
            // A concurrent grant has transferred the turn even if cancellation won the wakeup.
            if !queued { give() }
            throw CancellationError()
        }
    }

    func give() {
        let next = state.withLock { state -> AsyncStream<Void>.Continuation? in
            guard !state.waiting.isEmpty else { state.taken = false; return nil }
            return state.waiting.removeFirst().output
        }
        next?.yield(())
        next?.finish()
    }
}

/// The operation boundary shared by every reader and writer of a calls store.
/// A decorator may suspend acquisition for external coordination. A failed take owns no turn.
public struct CallsStorageGuard: Sendable {
    public enum Operation: Sendable { case access, publishTranscript, restorePreviousTranscript }
    public let take: @Sendable (Operation) async throws -> Void
    public let give: @Sendable () -> Void

    public init(take: @escaping @Sendable (Operation) async throws -> Void, give: @escaping @Sendable () -> Void) {
        self.take = take; self.give = give
    }

    /// Reports admission as immediate or queued after the operation is registered.
    public static func serial(admitted: @escaping @Sendable (Bool) -> Void = { _ in }) -> Self {
        let turn = Turn(admitted: admitted)
        return .init(take: { _ in try await turn.take() }, give: { turn.give() })
    }
}
