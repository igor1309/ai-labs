import ClientConnect
import Testing

typealias Connect = ClientConnect

@MainActor
struct ClientConnectTests {
    @Test func effectsRunBeforeReturningTheirStreams() async {
        let host = Connect.Host(id: "host", name: nil)
        let session = Connect.HostSession(publicKey: [1, 2], id: [3, 4])
        let amount = Connect.SealedAmount(counter: 4, box: [8, 9])
        let cases: [(Connect.Effect, Ports.Call)] = [
            (.startDeadline(seconds: 10), .startDeadline(10)),
            (.connect(host), .connect(host)),
            (.derive(session), .derive(session)),
            (.writeKey([5, 6]), .writeKey([5, 6])),
            (.open(amount), .open(amount)),
            (.stopDeadline, .stopDeadline),
            (.dropLink, .drop),
            (.closeSession, .close),
        ]
        for (effect, call) in cases {
            let ports = Ports(largestWrite: 34, key: [5, 6], amount: 12_450)
            let handler = Connect.Handler(link: ports, session: ports, deadline: ports)
            let stream = handler.handle(effect)
            #expect(ports.calls == [call])
            let events = await collect(stream)
            #expect(events.count == 1)
        }
    }

    @Test(arguments: [Result<[UInt8], Connect.Failure>.success([5, 6]), .failure(.sessionDisagreement)])
    func deriveDeliversTheSessionsResult(result: Result<[UInt8], Connect.Failure>) async {
        let ports = Ports(largestWrite: 34, key: [5, 6], amount: 12_450)
        ports.derivation = result
        let handler = Connect.Handler(link: ports, session: ports, deadline: ports)

        let events = await collect(handler.handle(.derive(.init(publicKey: [1, 2], id: [3, 4]))))

        guard events.count == 1, case .derivationResult(let delivered) = events[0] else {
            Issue.record("expected one derivation result, got \(events)")
            return
        }
        #expect(delivered == result)
    }

    @Test(arguments: [Result<Connect.Amount, Connect.Failure>.success(.init(minorUnits: 12_450)), .failure(.unreadableAmount)])
    func openDeliversTheSessionsResultWithTheLinkAndSessionToHandOver(
        result: Result<Connect.Amount, Connect.Failure>
    ) async {
        let ports = Ports(largestWrite: 34, key: [5, 6], amount: 12_450)
        ports.opening = result
        let handler = Connect.Handler(link: ports, session: ports, deadline: ports)

        let events = await collect(handler.handle(.open(.init(counter: 4, box: [8, 9]))))

        guard events.count == 1, case .amountOpened(let delivered, let link, let session) = events[0] else {
            Issue.record("expected one opened amount, got \(events)")
            return
        }
        #expect(delivered == result)
        #expect(link === ports)
        #expect(session === ports)
    }
}

@MainActor
private final class Ports: Connect.Link, Connect.Session, Connect.Deadline {
    enum Call: Equatable {
        case startDeadline(Int), connect(Connect.Host), derive(Connect.HostSession)
        case writeKey([UInt8]), open(Connect.SealedAmount), stopDeadline, drop, close
    }

    let largestWrite: Int
    var calls: [Call] = []
    var deadlineRemaining: Int?
    var linkIsOpen = false
    var sessionIsClosed = false
    var derivation: Result<[UInt8], Connect.Failure>
    var opening: Result<Connect.Amount, Connect.Failure>

    init(largestWrite: Int, key: [UInt8], amount: UInt64) {
        self.largestWrite = largestWrite
        derivation = .success(key)
        opening = .success(.init(minorUnits: amount))
    }

    func connect(to host: Connect.Host) {
        calls.append(.connect(host))
        linkIsOpen = true
    }

    func writeKey(_ key: [UInt8]) {
        calls.append(.writeKey(key))
    }

    func derive(with host: Connect.HostSession) -> Result<[UInt8], Connect.Failure> {
        calls.append(.derive(host))
        sessionIsClosed = false
        return derivation
    }

    func open(_ amount: Connect.SealedAmount) -> Result<Connect.Amount, Connect.Failure> {
        calls.append(.open(amount))
        return opening
    }

    func start(seconds: Int) {
        calls.append(.startDeadline(seconds))
        deadlineRemaining = seconds
    }

    func advance(seconds: Int) -> Connect.Event? {
        guard let remaining = deadlineRemaining else { return nil }
        if seconds < remaining {
            deadlineRemaining = remaining - seconds
            return nil
        }
        deadlineRemaining = nil
        return .deadlineExpired
    }

    func stop() {
        calls.append(.stopDeadline)
        deadlineRemaining = nil
    }

    func drop() {
        calls.append(.drop)
        linkIsOpen = false
    }

    func close() {
        calls.append(.close)
        sessionIsClosed = true
    }
}

@MainActor
private func collect(_ stream: AsyncStream<Connect.Event>) async -> [Connect.Event] {
    var events: [Connect.Event] = []
    for await event in stream { events.append(event) }
    return events
}
