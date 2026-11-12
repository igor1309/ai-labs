import ClientConnect
import Testing

typealias Connect = ClientConnect

private let host = Connect.Host(id: "peripheral-7F3A", name: "MIZAN-7F3A")
private let hostSession = Connect.HostSession(publicKey: [1, 2], id: [3, 4])
private let sealed = Connect.SealedAmount(counter: 4, box: [8, 9])

@MainActor
struct ClientConnectEffectHandlerTests {
    // Each effect calls its one collaborator with the effect's payload, and nothing else.
    @Test(arguments: [
        (Connect.Effect.startDeadline(seconds: 10), Call.startDeadline(10)),
        (.connect(host), .connect(host)),
        (.derive(hostSession), .derive(hostSession)),
        (.writeKey([5, 6]), .writeKey([5, 6])),
        (.open(sealed), .open(sealed)),
        (.stopDeadline, .stopDeadline),
        (.dropLink, .drop),
        (.closeSession, .close),
    ])
    func effectCallsOnlyItsCollaboratorWithItsPayload(effect: Connect.Effect, call: Call) {
        let (sut, spies) = makeSUT()

        _ = sut.handle(effect)

        #expect(spies.calls == [call])
    }

    @Test(arguments: [
        (Connect.Effect.startDeadline(seconds: 10), Connect.Event.deadlineStarted),
        (.connect(host), .connectionInitiated),
        (.writeKey([5, 6]), .keyWriteInitiated),
        (.stopDeadline, .deadlineStopped),
        (.dropLink, .linkDroppedForCleanup),
        (.closeSession, .sessionClosed),
    ])
    func commandDeliversItsCompletionOnceTheCollaboratorReturns(effect: Connect.Effect, event: Connect.Event) {
        let (sut, _) = makeSUT()

        expect(sut, with: effect, toDeliver: event)
    }

    @Test(arguments: [
        Result<[UInt8], Connect.Failure>.success([5, 6, 7]), .failure(.sessionDisagreement),
    ])
    func deriveDeliversTheSessionsResult(result: Result<[UInt8], Connect.Failure>) {
        let (sut, spies) = makeSUT()
        spies.session.derivation = result

        expect(sut, with: .derive(hostSession), toDeliver: .derivationResult(result))
    }

    @Test(arguments: [
        Result<Connect.Amount, Connect.Failure>.success(.init(minorUnits: 12_450)), .failure(.unreadableAmount),
    ])
    func openDeliversTheSessionsResultWithTheLinkAndSession(result: Result<Connect.Amount, Connect.Failure>) {
        let (sut, spies) = makeSUT()
        spies.session.opening = result

        expect(
            sut, with: .open(sealed),
            toDeliver: .amountOpened(result, link: spies.link, session: spies.session)
        )
    }
}

// MARK: - Helpers

enum Call: Equatable, Sendable {
    case startDeadline(Int), connect(Connect.Host), derive(Connect.HostSession)
    case writeKey([UInt8]), open(Connect.SealedAmount), stopDeadline, drop, close
}

@MainActor
private func makeSUT() -> (Connect.Handler, Spies) {
    let spies = Spies()
    return (Connect.Handler(link: spies.link, session: spies.session, deadline: spies.deadline), spies)
}

@MainActor
private func expect(
    _ sut: Connect.Handler,
    with effect: Connect.Effect,
    toDeliver expected: Connect.Event,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    #expect(sut.handle(effect) == expected, sourceLocation: sourceLocation)
}

@MainActor
private final class Spies {
    private let log = CallLog()
    lazy var link = LinkSpy(log: log)
    lazy var session = SessionSpy(log: log)
    lazy var deadline = DeadlineSpy(log: log)
    var calls: [Call] { log.calls }
}

@MainActor
private final class CallLog {
    var calls: [Call] = []
}

@MainActor
private final class LinkSpy: Connect.Link {
    private let log: CallLog
    init(log: CallLog) { self.log = log }

    func connect(to host: Connect.Host) { log.calls.append(.connect(host)) }
    func writeKey(_ key: [UInt8]) { log.calls.append(.writeKey(key)) }
    func drop() { log.calls.append(.drop) }
}

@MainActor
private final class SessionSpy: Connect.Session {
    private let log: CallLog
    var derivation: Result<[UInt8], Connect.Failure> = .success([1])
    var opening: Result<Connect.Amount, Connect.Failure> = .success(.init(minorUnits: 1))
    init(log: CallLog) { self.log = log }

    func derive(with host: Connect.HostSession) -> Result<[UInt8], Connect.Failure> {
        log.calls.append(.derive(host))
        return derivation
    }

    func open(_ amount: Connect.SealedAmount) -> Result<Connect.Amount, Connect.Failure> {
        log.calls.append(.open(amount))
        return opening
    }

    func close() { log.calls.append(.close) }
}

@MainActor
private final class DeadlineSpy: Connect.Deadline {
    private let log: CallLog
    init(log: CallLog) { self.log = log }

    func start(seconds: Int) { log.calls.append(.startDeadline(seconds)) }
    func stop() { log.calls.append(.stopDeadline) }
}
