import ClientPayment
import Testing

@MainActor
struct ClientPaymentEffectHandlerTests {
    @Test(arguments: [[], [0x51], [0xFF, 0x12, 0x34]] as [[UInt8]], [ClientPayment.Outcome.success, .failure, nil])
    func openOpensTheMessageInTheSessionOnly(message: [UInt8], outcome: ClientPayment.Outcome?) {
        let (sut, spies) = makeSUT()
        spies.session.outcome = outcome

        expect(sut, with: .open(message), toDeliver: .opened(outcome))

        #expect(spies.calls == [.open(message)])
    }

    @Test(arguments: [ClientPayment.Outcome.success, .failure, nil])
    func openDeliversTheSessionsOutcome(outcome: ClientPayment.Outcome?) {
        let (sut, spies) = makeSUT()
        spies.session.outcome = outcome

        expect(sut, with: .open([0x51]), toDeliver: .opened(outcome))
    }

    @Test func finishClosesTheSessionThenDropsTheLink() {
        let (sut, spies) = makeSUT()

        _ = sut.handle(.finish)

        #expect(spies.calls == [.close, .drop])
    }

    @Test func finishDeliversFinishedOnceBothReturn() {
        let (sut, _) = makeSUT()

        expect(sut, with: .finish, toDeliver: .finished)
    }
}

// MARK: - Helpers

private enum Call: Equatable { case open([UInt8]), close, drop }

@MainActor
private func makeSUT() -> (ClientPayment.EffectHandler, Spies) {
    let spies = Spies()
    return (ClientPayment.EffectHandler(session: spies.session, link: spies.link), spies)
}

@MainActor
private func expect(
    _ sut: ClientPayment.EffectHandler,
    with effect: ClientPayment.Effect,
    toDeliver expected: ClientPayment.Event,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    #expect(sut.handle(effect) == expected, sourceLocation: sourceLocation)
}

@MainActor
private final class Spies {
    private let log = CallLog()
    lazy var session = SessionSpy(log: log)
    lazy var link = LinkSpy(log: log)
    var calls: [Call] { log.calls }
}

@MainActor
private final class CallLog {
    var calls: [Call] = []
}

@MainActor
private final class SessionSpy: ClientPayment.Session {
    private let log: CallLog
    var outcome: ClientPayment.Outcome? = .success
    init(log: CallLog) { self.log = log }

    func open(_ message: [UInt8]) -> ClientPayment.Outcome? {
        log.calls.append(.open(message))
        return outcome
    }

    func close() { log.calls.append(.close) }
}

@MainActor
private final class LinkSpy: ClientPayment.Link {
    private let log: CallLog
    init(log: CallLog) { self.log = log }

    func drop() { log.calls.append(.drop) }
}
