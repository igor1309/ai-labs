import ClientConnect
import Testing

typealias Connect = ClientConnect

@MainActor
struct ClientConnectTests {
    @Test func connectingToChosenHost() async {
        let ports = Ports(largestWrite: 64, key: [7, 8, 9], amount: 12450)
        let flow = Flow(ports: ports)
        await flow.send(.start)
        #expect(flow.state.host == flow.host)
        #expect(flow.state.phase == .connecting(.connecting))
        #expect(flow.state.canCancel)
        #expect(!flow.state.canRetry)
        #expect(!flow.state.isDone)
        #expect(ports.calls == [.startDeadline(10), .connect(flow.host)])
    }

    @Test(arguments: [34, 64])
    func secureLinkHandedOverWithAmount(_ largestWrite: Int) async {
        let key = Array(repeating: UInt8(7), count: 33)
        let ports = Ports(largestWrite: largestWrite, key: key, amount: 12450)
        let flow = Flow(ports: ports)
        await flow.connect()
        #expect(flow.state.phase == .connecting(.writingKey))
        await flow.send(.keyWriteResult(.success(())))
        #expect(!flow.state.isDone)
        await flow.send(.amountReceived(flow.sealedAmount))
        guard case .handedOver(let handover) = flow.state.phase else {
            Issue.record("Expected a secure link with its amount, got \(flow.state.phase)")
            return
        }
        #expect(handover.amount == Connect.Amount(minorUnits: 12450))
        #expect(handover.link === ports)
        #expect(handover.session === ports)
        #expect(flow.state.isDone)
        #expect(!flow.state.canCancel)
        #expect(!flow.state.canRetry)
        #expect(ports.calls == [
            .startDeadline(10), .connect(flow.host), .derive(flow.hostSession),
            .writeKey(key), .open(flow.sealedAmount), .stopDeadline,
        ])
    }

    @Test(arguments: [Connect.Step.connecting, .deriving, .writingKey, .waitingForAmount, .openingAmount])
    func linkDropsDuringHandshake(_ step: Connect.Step) async {
        let flow = Flow(ports: Ports(largestWrite: 64, key: [7, 8, 9], amount: 12450))
        await flow.reach(step)
        await flow.send(.linkDropped)
        flow.expectFailure(.linkDropped)
    }

    @Test func hostSessionDoesNotAgree() async {
        let ports = Ports(largestWrite: 64, key: [7, 8, 9], amount: 12450)
        ports.derivation = .failure(.sessionDisagreement)
        let flow = Flow(ports: ports)
        await flow.connect()
        flow.expectFailure(.sessionDisagreement)
        #expect(ports.calls.contains(.derive(flow.hostSession)))
        #expect(!ports.calls.contains(.writeKey([7, 8, 9])))
    }

    @Test func handshakeDeadlineExpires() async throws {
        let ports = Ports(largestWrite: 64, key: [7, 8, 9], amount: 12450)
        let flow = Flow(ports: ports)
        await flow.send(.start)
        #expect(ports.advance(seconds: 9) == nil)
        #expect(flow.state.phase == .connecting(.connecting))
        let expiry = try #require(ports.advance(seconds: 1))
        await flow.send(expiry)
        flow.expectFailure(.deadlineExceeded)
    }

    @Test(arguments: [0, 20, 32])
    func keyDoesNotFitOneWrite(_ largestWrite: Int) async {
        let key = Array(repeating: UInt8(7), count: 33)
        let ports = Ports(largestWrite: largestWrite, key: key, amount: 12450)
        let flow = Flow(ports: ports)
        await flow.connect()
        flow.expectFailure(.keyTooLarge)
        #expect(!ports.calls.contains(.writeKey(key)))
    }

    @Test(arguments: ["no service", "subscription refused", "unreadable session"])
    func connectionCannotBeSetUp(_ reason: String) async {
        let ports = Ports(largestWrite: 64, key: [7, 8, 9], amount: 12450)
        let flow = Flow(ports: ports)
        await flow.send(.start)
        await flow.send(.connectionResult(.failure(.connection(reason))))
        flow.expectFailure(.connection(reason))
    }

    @Test(arguments: ["ATT write not permitted", "ATT unlikely error"])
    func hostRefusesKey(_ reason: String) async {
        let ports = Ports(largestWrite: 64, key: [7, 8, 9], amount: 12450)
        let flow = Flow(ports: ports)
        await flow.connect()
        await flow.send(.keyWriteResult(.failure(.keyRefused(reason))))
        flow.expectFailure(.keyRefused(reason))
    }

    @Test(arguments: [Connect.Step.startingDeadline, .connecting, .deriving, .writingKey,
                      .waitingForAmount, .openingAmount])
    func payerCancels(_ step: Connect.Step) async {
        let ports = Ports(largestWrite: 64, key: [7, 8, 9], amount: 12450)
        let flow = Flow(ports: ports)
        await flow.reach(step)
        await flow.send(.cancel)
        #expect(flow.state.phase == .over)
        #expect(flow.state.isDone)
        #expect(!flow.state.canCancel)
        #expect(!flow.state.canRetry)
        #expect(ports.calls.suffix(3) == [.stopDeadline, .drop, .close])
    }

    @Test func retryEndsFailedTransaction() async {
        let ports = Ports(largestWrite: 64, key: [7, 8, 9], amount: 12450)
        let flow = Flow(ports: ports)
        await flow.send(.start)
        await flow.send(.linkDropped)
        flow.expectFailure(.linkDropped)
        let calls = ports.calls
        await flow.send(.retry)
        #expect(flow.state.phase == .over)
        #expect(flow.state.isDone)
        #expect(!flow.state.canRetry)
        #expect(!flow.state.canCancel)
        #expect(ports.calls == calls)
    }

    @Test func decisionWouldNotFitOneWrite() async {
        let ports = Ports(largestWrite: 33, key: Array(repeating: 7, count: 33), amount: 12450)
        let flow = Flow(ports: ports)
        await flow.connect()
        await flow.send(.keyWriteResult(.success(())))
        await flow.send(.amountReceived(flow.sealedAmount))
        flow.expectFailure(.decisionTooLarge)
        #expect(!ports.calls.contains(.open(flow.sealedAmount)))
    }

    @Test(arguments: [false, true])
    func amountBeforeKeyAcknowledgementIsKept(_ duplicate: Bool) async {
        let ports = Ports(largestWrite: 64, key: [7, 8, 9], amount: 12450)
        let flow = Flow(ports: ports)
        await flow.connect()
        await flow.send(.amountReceived(flow.sealedAmount))
        let other = Connect.SealedAmount(counter: 5, box: [10, 11])
        if duplicate { await flow.send(.amountReceived(other)) }
        #expect(flow.state.phase == .connecting(.writingKey))
        #expect(!ports.calls.contains(.open(flow.sealedAmount)))
        await flow.send(.keyWriteResult(.success(())))
        #expect(flow.state.phase == .handedOver(.init(link: ports, session: ports, amount: .init(minorUnits: 12450))))
        #expect(ports.calls.suffix(2) == [.open(flow.sealedAmount), .stopDeadline])
        let state = flow.state
        let calls = ports.calls
        await flow.send(.amountReceived(other))
        #expect(flow.state == state)
        #expect(ports.calls == calls)
    }

    @Test func unreadableAmountFailsHandshake() async {
        let ports = Ports(largestWrite: 64, key: [7, 8, 9], amount: 12450)
        ports.opening = .failure(.unreadableAmount)
        let flow = Flow(ports: ports)
        await flow.connect()
        await flow.send(.keyWriteResult(.success(())))
        await flow.send(.amountReceived(flow.sealedAmount))
        flow.expectFailure(.unreadableAmount)
        #expect(ports.calls.contains(.open(flow.sealedAmount)))
    }

    @Test(arguments: [false, true])
    func transactionEndsAfterCleanup(_ retry: Bool) async throws {
        let ports = Ports(largestWrite: 64, key: [7, 8, 9], amount: 12450)
        let flow = Flow(ports: ports)
        await flow.reach(.waitingForAmount)
        var effect: Connect.Effect?
        if retry {
            effect = flow.dispatch(.linkDropped)
            _ = flow.dispatch(.retry)
        } else {
            effect = flow.dispatch(.cancel)
        }
        #expect(!flow.state.isDone)
        #expect(!flow.state.canCancel)
        #expect(!flow.state.canRetry)
        for expected: Connect.Effect in [.stopDeadline, .dropLink, .closeSession] {
            #expect(effect == expected)
            let pending = try #require(effect)
            let result = await flow.handler.handle(pending)
            let event = try #require(result)
            #expect(!flow.state.isDone)
            effect = flow.dispatch(event)
        }
        #expect(effect == nil)
        #expect(flow.state.phase == .over)
        #expect(flow.state.isDone)
        #expect(ports.calls.suffix(3) == [.stopDeadline, .drop, .close])
    }
}

@MainActor
private final class Flow {
    let host = Connect.Host(id: "peripheral-7F3A", name: "MIZAN-7F3A")
    let hostSession = Connect.HostSession(publicKey: [1, 2, 3], id: [4, 5, 6])
    let sealedAmount = Connect.SealedAmount(counter: 4, box: [8, 9])
    let ports: Ports
    let handler: Connect.Handler
    var state: Connect.State

    init(ports: Ports) {
        self.ports = ports
        handler = Connect.Handler(link: ports, session: ports, deadline: ports)
        state = Connect.State(host: host)
    }

    func expectFailure(_ failure: Connect.Failure) {
        #expect(state.phase == .couldNotConnect(failure))
        #expect(state.canRetry)
        #expect(!state.canCancel)
        #expect(!state.isDone)
        #expect(ports.calls.suffix(3) == [.stopDeadline, .drop, .close])
        #expect(ports.deadlineRemaining == nil)
    }

    func reach(_ step: Connect.Step) async {
        if step == .startingDeadline {
            _ = dispatch(.start)
            return
        }
        await send(.start)
        if step == .connecting { return }
        if step == .deriving {
            _ = dispatch(.connectionResult(.success(.init(session: hostSession, largestWrite: ports.largestWrite))))
            return
        }
        await send(.connectionResult(.success(.init(session: hostSession, largestWrite: ports.largestWrite))))
        if step == .writingKey { return }
        await send(.keyWriteResult(.success(())))
        if step == .waitingForAmount { return }
        _ = dispatch(.amountReceived(sealedAmount))
    }

    func connect() async {
        await send(.start)
        await send(.connectionResult(.success(.init(session: hostSession, largestWrite: ports.largestWrite))))
    }

    func send(_ event: Connect.Event) async {
        var effect = dispatch(event)
        while let current = effect {
            guard let event = await handler.handle(current) else { break }
            effect = dispatch(event)
        }
    }

    func dispatch(_ event: Connect.Event) -> Connect.Effect? {
        let (next, effect) = Connect.reduce(state, event)
        state = next
        return effect
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
    var derivation: Result<[UInt8], Connect.Failure>
    var opening: Result<Connect.Amount, Connect.Failure>

    init(largestWrite: Int, key: [UInt8], amount: UInt64) {
        self.largestWrite = largestWrite
        derivation = .success(key)
        opening = .success(.init(minorUnits: amount))
    }

    func connect(to host: Connect.Host) {
        calls.append(.connect(host))
    }

    func writeKey(_ key: [UInt8]) {
        calls.append(.writeKey(key))
    }

    func derive(with host: Connect.HostSession) -> Result<[UInt8], Connect.Failure> {
        calls.append(.derive(host))
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

    func drop() { calls.append(.drop) }
    func close() { calls.append(.close) }
}
