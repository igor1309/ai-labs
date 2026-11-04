import CallText
import Testing

/// Obtains mapper input from the same public side contract that supplies a call.
func publishedCall(
    status: State.Status, mine: [SideState.Entry], theirs: [SideState.Entry]
) async throws -> State {

    let sideStatus: SideState.Status = switch status {
    case .off: .off
    case .gettingReady: .gettingReady
    case .listening, .finished: .listening
    case let .failed(message): .failed(message)
    }
    let call = CallText(
        microphone: PublishedSide(snapshot: .init(status: sideStatus, entries: mine)),
        call: PublishedSide(snapshot: .init(status: sideStatus, entries: theirs))
    )
    await call.start(enabled: status != .off)
    await call.stop()
    var published: State?
    for await snapshot in call.updates {
        if snapshot.status == status, snapshot.entries.count == mine.count + theirs.count {
            published = snapshot
        }
    }
    return try #require(published)
}

actor PublishedSide: Side {

    private struct Delivery {
        let snapshot: SideState
        let received: CheckedContinuation<Void, Never>
    }

    private var snapshot: SideState
    private let deliveries = AsyncStream<Delivery>.makeStream()
    private(set) var switches: [Bool] = []

    init(snapshot: SideState) { self.snapshot = snapshot }

    func listen(_ receive: @escaping @Sendable (SideState) async -> Void) async {
        for await delivery in deliveries.stream {
            await receive(delivery.snapshot)
            delivery.received.resume()
        }
    }

    func start(enabled: Bool) async { await send(snapshot) }

    func setEnabled(_ enabled: Bool) async {
        switches.append(enabled)
        await send(.init(status: enabled ? .listening : .off, entries: snapshot.entries))
    }

    func send(_ snapshot: SideState) async {
        self.snapshot = snapshot
        await withCheckedContinuation {
            deliveries.continuation.yield(Delivery(snapshot: snapshot, received: $0))
        }
    }

    func end(_ snapshot: SideState) async {
        await send(snapshot)
        deliveries.continuation.finish()
    }

    func stop() { deliveries.continuation.finish() }
}
