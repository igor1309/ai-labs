import ClientReview
import Testing

@MainActor
struct ClientReviewEffectHandlerTests {
    @Test(arguments: [
        (ClientReview.Effect.seal(.confirm), Call.seal(.confirm)),
        (.seal(.decline), .seal(.decline)),
        (.open([1, 2]), .open([1, 2])),
        (.closeSession, .close),
        (.dropLink, .drop),
    ])
    func effectCallsOnlyItsCollaboratorWithItsPayload(effect: ClientReview.Effect, call: Call) async {
        let (sut, spies) = makeSUT()

        _ = await sut.handle(effect)

        #expect(spies.calls == [call])
    }

    @Test(arguments: [ClientReview.Decision.confirm, .decline])
    func sealDeliversTheSealedBytes(decision: ClientReview.Decision) async {
        let (sut, spies) = makeSUT()
        spies.session.sealed = [9, 8, 7]

        await expect(sut, with: .seal(decision), toDeliver: .sealed(decision, [9, 8, 7]))
    }

    @Test(arguments: [ClientReview.Message.decisionAcknowledged, .end, .unrelated, nil])
    func openDeliversTheSessionsMessage(message: ClientReview.Message?) async {
        let (sut, spies) = makeSUT()
        spies.session.message = message

        await expect(sut, with: .open([1, 2]), toDeliver: .opened(message))
    }

    @Test func closeSessionDeliversSessionClosed() async {
        let (sut, _) = makeSUT()

        await expect(sut, with: .closeSession, toDeliver: .sessionClosed)
    }

    @Test func dropLinkDeliversLinkDropped() async {
        let (sut, _) = makeSUT()

        await expect(sut, with: .dropLink, toDeliver: .linkDropped)
    }

    @Test func writeSendsTheSealedBytesOnly() async {
        let (sut, spies) = makeSUT()

        await expect(sut, with: .write(.confirm, [9, 8, 7]), toDeliver: .written(.confirm, .accepted)) {
            spies.sender.complete(with: .accepted)
        }

        #expect(spies.calls == [.write([9, 8, 7])])
    }

    @Test(arguments: [ClientReview.Decision.confirm, .decline], [ClientReview.WriteResult.accepted, .refused])
    func writeDeliversTheWriteResponseForItsDecision(
        decision: ClientReview.Decision, result: ClientReview.WriteResult
    ) async {
        let (sut, spies) = makeSUT()

        await expect(sut, with: .write(decision, [9, 8, 7]), toDeliver: .written(decision, result)) {
            spies.sender.complete(with: result)
        }
    }
}

// MARK: - Helpers

enum Call: Equatable, Sendable {
    case seal(ClientReview.Decision), write([UInt8]), open([UInt8]), close, drop
}

@MainActor
private func makeSUT() -> (ClientReview.EffectHandler, Spies) {
    let spies = Spies()
    return (ClientReview.EffectHandler(session: spies.session, sender: spies.sender, link: spies.link), spies)
}

@MainActor
private func expect(
    _ sut: ClientReview.EffectHandler,
    with effect: ClientReview.Effect,
    toDeliver expected: ClientReview.Event,
    on action: @MainActor () -> Void = {},
    sourceLocation: SourceLocation = #_sourceLocation
) async {
    let event = Task { await sut.handle(effect) }
    action()
    #expect(await event.value == expected, sourceLocation: sourceLocation)
}

@MainActor
private final class Spies {
    private let log = CallLog()
    lazy var session = SessionSpy(log: log)
    lazy var sender = SenderSpy(log: log)
    lazy var link = LinkSpy(log: log)
    var calls: [Call] { log.calls }
}

@MainActor
private final class CallLog {
    var calls: [Call] = []
}

@MainActor
private final class SessionSpy: ClientReview.Session {
    private let log: CallLog
    var sealed: [UInt8] = [1]
    var message: ClientReview.Message?
    init(log: CallLog) { self.log = log }

    func seal(_ decision: ClientReview.Decision) -> [UInt8] {
        log.calls.append(.seal(decision))
        return sealed
    }

    func open(_ bytes: [UInt8]) -> ClientReview.Message? {
        log.calls.append(.open(bytes))
        return message
    }

    func close() { log.calls.append(.close) }
}

/// Holds each write until the test completes it, in either order.
@MainActor
private final class SenderSpy: ClientReview.Sender {
    private let log: CallLog
    private var waiting: CheckedContinuation<ClientReview.WriteResult, Never>?
    private var completed: ClientReview.WriteResult?
    init(log: CallLog) { self.log = log }

    func write(_ bytes: [UInt8]) async -> ClientReview.WriteResult {
        log.calls.append(.write(bytes))
        if let completed { return completed }
        return await withCheckedContinuation { waiting = $0 }
    }

    func complete(with result: ClientReview.WriteResult) {
        if let waiting {
            self.waiting = nil
            waiting.resume(returning: result)
        } else {
            completed = result
        }
    }
}

@MainActor
private final class LinkSpy: ClientReview.Link {
    private let log: CallLog
    init(log: CallLog) { self.log = log }

    func drop() { log.calls.append(.drop) }
}
