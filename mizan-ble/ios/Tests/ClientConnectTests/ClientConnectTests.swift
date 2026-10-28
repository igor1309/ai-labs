import ClientConnect
import Testing

typealias Connect = ClientConnect

@MainActor
struct ClientConnectTests {
    enum Ending: CaseIterable {
        case cancel, failure, retry, expiry
    }

    enum CleanupBoundary: Int, CaseIterable {
        case stoppingDeadline, waitingForWork, droppingLink, closingSession, done
    }

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

    @Test func unnamedChosenHostConnects() async {
        let host = Connect.Host(id: "peripheral-7F3A", name: nil)
        let ports = Ports(largestWrite: 64, key: [7, 8, 9], amount: 12450)
        let flow = Flow(ports: ports, host: host)
        await flow.send(.start)
        #expect(flow.state.host.id == "peripheral-7F3A")
        #expect(flow.state.host.name == nil)
        #expect(flow.state.phase == .connecting(.connecting))
        #expect(flow.state.canCancel)
        #expect(ports.calls == [.startDeadline(10), .connect(host)])
        await flow.send(.connectionResult(.success(.init(session: flow.hostSession, largestWrite: 64))))
        await flow.send(.keyWriteResult(.success(())))
        await flow.send(.amountReceived(flow.sealedAmount))
        #expect(flow.state.phase == .handedOver(.init(link: ports, session: ports,
                                                    amount: .init(minorUnits: 12450))))
        #expect(flow.state.isDone)
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

    @Test(arguments: [Connect.Step.startingDeadline, .connecting, .deriving, .writingKey, .waitingForAmount, .openingAmount])
    func linkDropsDuringHandshake(_ step: Connect.Step) async {
        let flow = Flow(ports: Ports(largestWrite: 64, key: [7, 8, 9], amount: 12450))
        await flow.reach(step)
        flow.dispatch(.linkDropped)
        await flow.drainCleanup()
        #expect(flow.state.phase == .couldNotConnect(.linkDropped))
        await flow.drain()
        flow.expectFailure(.linkDropped)
        #expect(!flow.ports.linkIsOpen)
        #expect(flow.ports.sessionIsClosed)
        #expect(flow.pending.isEmpty)
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

    @Test(arguments: [Connect.Step.startingDeadline, .connecting, .deriving, .writingKey,
                      .waitingForAmount, .openingAmount, .stoppingDeadline])
    func handshakeDeadlineExpires(_ step: Connect.Step) async throws {
        let ports = Ports(largestWrite: 64, key: [7, 8, 9], amount: 12450)
        let flow = Flow(ports: ports)
        await flow.reach(step)
        let started = step == .startingDeadline
            ? await flow.perform(.startDeadline(seconds: 10)) : nil
        #expect(ports.advance(seconds: 9) == nil)
        #expect(flow.state.phase == .connecting(step))
        let expiry = try #require(ports.advance(seconds: 1))
        let state = flow.state
        let calls = ports.calls
        let pending = flow.pending
        flow.dispatch(expiry)
        if step == .stoppingDeadline {
            #expect(flow.state == state)
            #expect(ports.calls == calls)
            #expect(flow.pending == pending)
            await flow.drain()
            #expect(flow.state.phase == .handedOver(.init(link: ports, session: ports,
                                                        amount: .init(minorUnits: 12450))))
            #expect(flow.state.isDone)
        } else {
            await flow.drainCleanup()
            if let started { flow.dispatch(started) }
            await flow.drain()
            flow.expectFailure(.deadlineExceeded)
            #expect(!ports.linkIsOpen)
            #expect(ports.sessionIsClosed)
            #expect(flow.pending.isEmpty)
        }
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
                      .waitingForAmount, .openingAmount, .stoppingDeadline])
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

    @Test(arguments: [Connect.Step.startingDeadline, .connecting, .deriving, .writingKey, .openingAmount],
          [false, true])
    func cleanupWaitsForOutstandingWork(_ step: Connect.Step, _ retry: Bool) async {
        let ports = Ports(largestWrite: 64, key: [7, 8, 9], amount: 12450)
        let flow = Flow(ports: ports)
        await flow.reach(step)
        if retry {
            flow.dispatch(.linkDropped)
            flow.dispatch(.retry)
        } else {
            flow.dispatch(.cancel)
        }
        await flow.drainCleanup()
        #expect(!flow.state.isDone)
        await flow.drain()
        #expect(flow.state.phase == .over)
        #expect(flow.state.isDone)
        #expect(flow.pending.isEmpty)
        #expect(!ports.linkIsOpen)
        #expect(ports.sessionIsClosed)
        #expect(ports.deadlineRemaining == nil)
        #expect(ports.calls.suffix(3) == [.stopDeadline, .drop, .close])
    }

    @Test(arguments: Ending.allCases, CleanupBoundary.allCases)
    func lateEventsDoNotReviveOrRestartCleanup(_ ending: Ending, _ boundary: CleanupBoundary) async {
        let ports = Ports(largestWrite: 64, key: [7, 8, 9], amount: 12450)
        let flow = Flow(ports: ports)
        await flow.reach(.openingAmount)
        switch ending {
        case .cancel: flow.dispatch(.cancel)
        case .expiry: flow.dispatch(.deadlineExpired)
        case .failure, .retry:
            flow.dispatch(.linkDropped)
            if ending == .retry { flow.dispatch(.retry) }
        }
        let phase = flow.state.phase
        if boundary != .stoppingDeadline {
            await flow.drainCleanup()
            #expect(!ports.sessionIsClosed)
            #expect(!flow.state.isDone)
            flow.expectIgnored(.linkDropped)
            flow.expectIgnored(.deadlineExpired)
        }
        await flow.run(.open(flow.sealedAmount))
        #expect(flow.state.phase == phase)
        for _ in 0..<max(0, boundary.rawValue - 1) {
            if let effect = flow.pending.first { await flow.run(effect) }
        }
        let lateEvents: [Connect.Event] = [
            .amountOpened(.success(.init(minorUnits: 999)), link: ports, session: ports),
            .amountOpened(.failure(.unreadableAmount), link: ports, session: ports),
            .linkDropped, .deadlineExpired,
        ]
        for event in lateEvents { flow.expectIgnored(event) }
        await flow.drain()
        if ending == .failure || ending == .expiry {
            flow.expectFailure(ending == .failure ? .linkDropped : .deadlineExceeded)
        } else {
            #expect(flow.state.phase == .over)
            #expect(flow.state.isDone)
        }
        #expect(flow.pending.isEmpty)
        #expect(!ports.linkIsOpen)
        #expect(ports.sessionIsClosed)
        #expect(ports.deadlineRemaining == nil)
        #expect(ports.calls.filter { $0 == .drop } == [.drop])
        #expect(ports.calls.filter { $0 == .close } == [.close])
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
            #expect(!flow.state.isDone)
            await flow.run(pending)
            effect = flow.pending.first
        }
        #expect(effect == nil)
        #expect(flow.state.phase == .over)
        #expect(flow.state.isDone)
        #expect(ports.calls.suffix(3) == [.stopDeadline, .drop, .close])
    }
}

@MainActor
private final class Flow {
    let host: Connect.Host
    let hostSession = Connect.HostSession(publicKey: [1, 2, 3], id: [4, 5, 6])
    let sealedAmount = Connect.SealedAmount(counter: 4, box: [8, 9])
    let ports: Ports
    let handler: Connect.Handler
    var state: Connect.State
    var pending: [Connect.Effect] = []

    init(ports: Ports, host: Connect.Host = .init(id: "peripheral-7F3A", name: "MIZAN-7F3A")) {
        self.host = host
        self.ports = ports
        handler = Connect.Handler(link: ports, session: ports, deadline: ports)
        state = Connect.State(host: host)
    }

    func expectIgnored(_ event: Connect.Event) {
        let state = state
        let calls = ports.calls
        let pending = pending
        dispatch(event)
        #expect(self.state == state)
        #expect(ports.calls == calls)
        #expect(self.pending == pending)
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
        dispatch(.start)
        if step == .startingDeadline { return }
        await run(.startDeadline(seconds: 10))
        if step == .connecting { return }
        await drain()
        dispatch(.connectionResult(.success(.init(session: hostSession, largestWrite: ports.largestWrite))))
        if step == .deriving { return }
        await run(.derive(hostSession))
        if step == .writingKey { return }
        await drain()
        dispatch(.keyWriteResult(.success(())))
        if step == .waitingForAmount { return }
        dispatch(.amountReceived(sealedAmount))
        if step == .openingAmount { return }
        await run(.open(sealedAmount))
    }

    func connect() async {
        await send(.start)
        await send(.connectionResult(.success(.init(session: hostSession, largestWrite: ports.largestWrite))))
    }

    func send(_ event: Connect.Event) async {
        dispatch(event)
        await drain()
    }

    func drain() async {
        while let effect = pending.first { await run(effect) }
    }

    func drainCleanup() async {
        while let effect = pending.first(where: { [.stopDeadline, .dropLink, .closeSession].contains($0) }) {
            await run(effect)
        }
    }

    func run(_ effect: Connect.Effect) async {
        if let event = await perform(effect) { dispatch(event) }
    }

    func perform(_ effect: Connect.Effect) async -> Connect.Event? {
        guard let index = pending.firstIndex(of: effect) else {
            Issue.record("Expected queued effect \(effect), got \(pending)")
            return nil
        }
        pending.remove(at: index)
        return await handler.handle(effect)
    }

    @discardableResult
    func dispatch(_ event: Connect.Event) -> Connect.Effect? {
        let (next, effect) = Connect.reduce(state, event)
        state = next
        if let effect { pending.append(effect) }
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
