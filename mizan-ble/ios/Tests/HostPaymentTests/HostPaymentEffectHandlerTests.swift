import HostPayment
import Testing

@MainActor
struct HostPaymentEffectHandlerTests {
    // Each effect calls its one collaborator with the effect's payload, and nothing else.
    @Test(arguments: [
        (HostPayment.Effect.open([9, 4]), Call.open([9, 4])),
        (.seal(.acknowledgement), .seal(.acknowledgement)),
        (.seal(.result(.success)), .seal(.result(.success))),
        (.seal(.end), .seal(.end)),
        (.send(.acknowledgement, [83, 17]), .send([83, 17])),
        (.closeSession, .close),
        (.endLink, .end),
    ])
    func effectCallsOnlyItsCollaboratorWithItsPayload(effect: HostPayment.Effect, call: Call) {
        let (sut, spies) = makeSUT()

        _ = sut.handle(effect)

        #expect(spies.calls == [call])
    }

    @Test(arguments: [HostPayment.Decision.confirm, .decline])
    func openDeliversTheClientsDecision(decision: HostPayment.Decision) {
        let (sut, spies) = makeSUT()
        spies.decision = decision

        expect(sut, with: .open([7]), toDeliver: .opened(decision))
    }

    @Test func openThatCannotBeReadIsRefused() {
        let (sut, spies) = makeSUT()
        spies.failing = true

        expect(sut, with: .open([255, 0]), toDeliver: .refused)
    }

    @Test(arguments: [HostPayment.Message.acknowledgement, .result(.success), .result(.failure), .end])
    func sealDeliversTheSealedBytes(message: HostPayment.Message) {
        let (sut, spies) = makeSUT()
        spies.sealedBytes = [42, 1]

        expect(sut, with: .seal(message), toDeliver: .sealed(message, [42, 1]))
    }

    @Test(arguments: [HostPayment.Message.acknowledgement, .result(.success), .result(.failure), .end])
    func sealFailureFailsTheSend(message: HostPayment.Message) {
        let (sut, spies) = makeSUT()
        spies.failing = true

        expect(sut, with: .seal(message), toDeliver: .sendFailed(message))

        #expect(spies.calls == [.seal(message)])
    }

    @Test(arguments: [HostPayment.Message.acknowledgement, .result(.failure), .end])
    func sendDeliversSentOnceQueued(message: HostPayment.Message) {
        let (sut, _) = makeSUT()

        expect(sut, with: .send(message, [83, 17]), toDeliver: .sent(message))
    }

    @Test(arguments: [HostPayment.Message.acknowledgement, .result(.success), .result(.failure), .end])
    func sendFailureFailsTheSend(message: HostPayment.Message) {
        let (sut, spies) = makeSUT()
        spies.failing = true

        expect(sut, with: .send(message, [83, 17]), toDeliver: .sendFailed(message))

        #expect(spies.calls == [.send([83, 17])])
    }

    @Test func closeSessionDeliversSessionClosed() {
        let (sut, _) = makeSUT()

        expect(sut, with: .closeSession, toDeliver: .sessionClosed)
    }

    @Test func endLinkDeliversLinkEnded() {
        let (sut, _) = makeSUT()

        expect(sut, with: .endLink, toDeliver: .linkEnded)
    }
}

// MARK: - Helpers

enum Call: Equatable, Sendable {
    case open([UInt8]), seal(HostPayment.Message), send([UInt8]), close, end
}

@MainActor
private func makeSUT() -> (HostPayment.EffectHandler, Spies) {
    let spies = Spies()
    return (HostPayment.EffectHandler(session: spies, sender: spies, link: spies), spies)
}

@MainActor
private func expect(
    _ sut: HostPayment.EffectHandler,
    with effect: HostPayment.Effect,
    toDeliver expected: HostPayment.Event,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    #expect(sut.handle(effect) == expected, sourceLocation: sourceLocation)
}

/// One spy for the three collaborators, so a test sees that an effect touched no other.
@MainActor
private final class Spies: HostPayment.Session, HostPayment.Sender, HostPayment.Link {
    private struct Failure: Error {}

    private(set) var calls: [Call] = []
    var decision: HostPayment.Decision = .decline
    var sealedBytes: [UInt8] = [83, 17]
    var failing = false

    func open(_ bytes: [UInt8]) throws -> HostPayment.Decision {
        calls.append(.open(bytes))
        if failing { throw Failure() }
        return decision
    }

    func seal(_ message: HostPayment.Message) throws -> [UInt8] {
        calls.append(.seal(message))
        if failing { throw Failure() }
        return sealedBytes
    }

    func send(_ bytes: [UInt8]) throws {
        calls.append(.send(bytes))
        if failing { throw Failure() }
    }

    func close() { calls.append(.close) }
    func end() { calls.append(.end) }
}
