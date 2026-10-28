import HostBroadcast
import Testing

private typealias Broadcast = HostBroadcast

@MainActor
struct HostBroadcastTests {
    @Test func lockingStartsBroadcastWithoutCountdown() async {
        let fake = Ports(seconds: 30, sessions: [session(1)])
        let flow = Flow(fake)

        await flow.send(.lock(amount: "124.50"))

        #expect(flow.state.phase == .goingOnAir)
        #expect(flow.state.amount == "124.50")
        #expect(flow.state.secondsLeft == nil)
        #expect(flow.state.canCancel)
        #expect(fake.calls == [.setting, .opened(first), .served(first, session(1)), .advertised(first)])
        #expect(fake.countdowns.isEmpty)
    }

    @Test(arguments: [15, 30, 60])
    func onAirStartsFullCountdown(_ seconds: Int) async {
        let fake = Ports(seconds: seconds, sessions: [session(1)])
        let flow = Flow(fake)
        await flow.send(.lock(amount: "124.50"))

        await flow.send(.onAir(first))

        #expect(flow.state.phase == .advertising)
        #expect(flow.state.secondsLeft == seconds)
        #expect(flow.state.canCancel)
        #expect(fake.countdowns == [first: seconds])
        #expect(fake.calls.last == .startedCountdown(first, seconds))
    }

    @Test(arguments: [Ports.Failure.serving, .advertising])
    fileprivate func cannotGoOnAirUnlocksAmountAndClosesSession(_ failure: Ports.Failure) async {
        let fake = Ports(seconds: 30, sessions: [session(1)])
        fake.failure = failure
        let flow = Flow(fake)

        await flow.send(.lock(amount: "124.50"))

        #expect(flow.state.phase == .ready)
        #expect(flow.state.amount == "124.50")
        #expect(flow.state.reason == failure.description)
        #expect(!flow.state.canCancel)
        expectRetired(fake, first)
    }

    @Test(arguments: [false, true])
    func cancelUnlocksAmountAndIgnoresLateOnAir(_ onAir: Bool) async {
        let fake = Ports(seconds: 30, sessions: [session(1)])
        let flow = Flow(fake)
        await flow.send(.lock(amount: "124.50"))
        if onAir { await flow.send(.onAir(first)) }

        await flow.send(.cancel)

        #expect(flow.state.phase == .ready)
        #expect(flow.state.amount == "124.50")
        #expect(flow.state.reason == nil)
        #expect(flow.state.secondsLeft == nil)
        #expect(!flow.state.canCancel)
        expectRetired(fake, first)
        let cancelled = flow.state
        let calls = fake.calls
        await flow.send(.onAir(first))
        #expect(flow.state == cancelled)
        #expect(fake.calls == calls)
    }

    @Test func countdownExpiryClearsAmountAndRetiresSession() async {
        let fake = Ports(seconds: 30, sessions: [session(1)])
        let flow = Flow(fake)
        await flow.send(.lock(amount: "124.50"))
        await flow.send(.onAir(first))

        await flow.send(.secondsLeft(first, 22))
        #expect(flow.state.secondsLeft == 22)
        await flow.send(.secondsLeft(first, 0))

        #expect(flow.state.phase == .timedOut)
        #expect(flow.state.amount.isEmpty)
        #expect(flow.state.secondsLeft == nil)
        #expect(!flow.state.canCancel)
        expectRetired(fake, first)
    }

    @Test(arguments: ["powered off", "unauthorized", "unsupported"])
    func bluetoothLossOnAirUnlocksAmountWithReason(_ reason: String) async {
        let fake = Ports(seconds: 30, sessions: [session(1)])
        let flow = Flow(fake)
        await flow.send(.lock(amount: "124.50"))
        await flow.send(.onAir(first))

        await flow.send(.bluetoothUnavailable(first, reason: reason))

        #expect(flow.state.phase == .ready)
        #expect(flow.state.amount == "124.50")
        #expect(flow.state.reason == reason)
        expectRetired(fake, first)
    }

    @Test func firstClientKeyKeepsServiceAndRemainingSeconds() async throws {
        let fake = Ports(seconds: 30, sessions: [session(1)])
        let flow = Flow(fake)
        await flow.send(.lock(amount: "124.50"))
        await flow.send(.onAir(first))
        await flow.send(.secondsLeft(first, 22))

        let effect = flow.accept(.clientKey(first, client, key: [7, 8]))

        #expect(flow.state.phase == .handshake(.stoppingAdvertising))
        #expect(flow.state.secondsLeft == 22)
        #expect(!flow.state.canCancel)
        #expect(effect == .stopAdvertising(first))
        let result = await flow.handler.handle(try #require(effect))
        #expect(result == .advertisingStopped(first))
        #expect(fake.advertising.isEmpty)
        #expect(fake.services == [first: session(1)])
        #expect(fake.countdowns == [first: 30])
    }

    @Test func amountSentHandsOverSecureLinkAndStopsCountdown() async {
        let fake = Ports(seconds: 30, sessions: [session(1)])
        let flow = Flow(fake)
        await flow.send(.lock(amount: "124.50"))
        await flow.send(.onAir(first))

        await flow.send(.clientKey(first, client, key: [7, 8]))

        guard case .handedOver(let secure) = flow.state.phase else {
            Issue.record("Expected a secure link, got \(flow.state.phase)")
            return
        }
        #expect(secure.attempt == first)
        #expect(secure.session == session(1))
        #expect(secure.link == client)
        #expect(secure.amount == "124.50")
        #expect(flow.state.secondsLeft == nil)
        #expect(!flow.state.canCancel)
        #expect(fake.calls.suffix(4) == [
            .stoppedAdvertising(first), .derived(first, [7, 8]), .sent(secure), .stoppedCountdown(first),
        ])
        #expect(fake.countdowns.isEmpty)
        #expect(fake.advertising.isEmpty)
        #expect(fake.services == [first: session(1)])
        #expect(fake.openSessions == [first])
    }

    @Test func handshakeDoesNotOfferCancelOrAnotherAttempt() async {
        let fake = Ports(seconds: 30, sessions: [session(1)])
        let flow = Flow(fake)
        await flow.send(.lock(amount: "124.50"))
        await flow.send(.onAir(first))
        let effect = flow.accept(.clientKey(first, client, key: [7, 8]))
        #expect(effect == .stopAdvertising(first))
        let handshake = flow.state

        for event: Broadcast.Event in [.cancel, .retry, .newAmount, .lock(amount: "99"),
                                      .clientKey(first, Broadcast.Link(id: "other"), key: [9])] {
            #expect(flow.accept(event) == nil)
            #expect(flow.state == handshake)
        }
        #expect(!flow.state.canCancel)
        #expect(!flow.state.canRetry)
        #expect(!flow.state.canChooseNewAmount)
    }

    @Test func staleStartupFailureCannotEndAnotherAttempt() async {
        let fake = Ports(seconds: 30, sessions: [session(1), session(2)])
        let flow = Flow(fake)
        await flow.send(.lock(amount: "124.50"))
        await flow.send(.cancel)
        await flow.send(.lock(amount: "99"))
        let current = flow.state
        let calls = fake.calls

        await flow.send(.couldNotGoOnAir(first, reason: "late failure"))

        #expect(flow.state == current)
        #expect(fake.calls == calls)
        #expect(fake.services == [Broadcast.Attempt(number: 2): session(2)])
    }

    @Test func invalidClientKeyOffersRetryAndNewAmount() async {
        let fake = Ports(seconds: 30, sessions: [session(1)])
        fake.failure = .deriving
        let flow = Flow(fake)
        await flow.send(.lock(amount: "124.50"))
        await flow.send(.onAir(first))

        await flow.send(.clientKey(first, client, key: [0]))

        expectFailed(flow, fake, reason: Ports.Failure.deriving.description)
        #expect(!fake.calls.contains { if case .sent = $0 { true } else { false } })
    }

    @Test func amountSendFailureOffersRetryAndNewAmount() async {
        let fake = Ports(seconds: 30, sessions: [session(1)])
        fake.failure = .sending
        let flow = Flow(fake)
        await flow.send(.lock(amount: "124.50"))
        await flow.send(.onAir(first))

        await flow.send(.clientKey(first, client, key: [7, 8]))

        expectFailed(flow, fake, reason: Ports.Failure.sending.description)
        #expect(fake.calls.contains(.derived(first, [7, 8])))
    }

    @Test(arguments: handshakeSteps)
    fileprivate func lostLinkDuringHandshakeOffersBothChoices(_ step: Broadcast.HandshakeStep) async throws {
        let fake = Ports(seconds: 30, sessions: [session(1)])
        let flow = Flow(fake)
        _ = try await flow.beginHandshake(stoppingAt: step)

        await flow.send(.linkLost(first, client))

        expectFailed(flow, fake, reason: "Client link lost")
    }

    @Test(arguments: handshakeSteps)
    fileprivate func bluetoothLossDuringHandshakeFails(_ step: Broadcast.HandshakeStep) async throws {
        let fake = Ports(seconds: 30, sessions: [session(1)])
        let flow = Flow(fake)
        _ = try await flow.beginHandshake(stoppingAt: step)

        await flow.send(.bluetoothUnavailable(first, reason: "Bluetooth off"))

        expectFailed(flow, fake, reason: "Bluetooth off")
    }

    @Test(arguments: handshakeSteps)
    fileprivate func countdownRemainsHandshakeDeadline(_ step: Broadcast.HandshakeStep) async throws {
        let fake = Ports(seconds: 30, sessions: [session(1)])
        let flow = Flow(fake)
        _ = try await flow.beginHandshake(stoppingAt: step)

        await flow.send(.secondsLeft(first, 7))
        #expect(flow.state.phase == .handshake(step))
        #expect(flow.state.secondsLeft == 7)
        await flow.send(.secondsLeft(first, 0))

        #expect(flow.state.phase == .timedOut)
        #expect(flow.state.amount.isEmpty)
        #expect(flow.state.secondsLeft == nil)
        expectRetired(fake, first)
        let timedOut = flow.state
        let calls = fake.calls
        for event: Broadcast.Event in [.advertisingStopped(first), .keyDerived(first), .amountSent(first)] {
            await flow.send(event)
            #expect(flow.state == timedOut)
            #expect(fake.calls == calls)
        }
    }

    @Test(arguments: [Ports.Failure.deriving, .sending])
    fileprivate func retryUsesFreshSessionSameAmountAndCurrentFullCountdown(_ failure: Ports.Failure) async {
        let fake = Ports(seconds: 30, sessions: [session(1), session(2)])
        fake.failure = failure
        let flow = Flow(fake)
        await flow.send(.lock(amount: "124.50"))
        await flow.send(.onAir(first))
        await flow.send(.secondsLeft(first, 22))
        await flow.send(.clientKey(first, client, key: [7, 8]))
        fake.failure = nil
        fake.duration = 60
        let second = Broadcast.Attempt(number: 2)

        await flow.send(.retry)

        #expect(flow.state.phase == .goingOnAir)
        #expect(flow.state.amount == "124.50")
        #expect(flow.state.reason == nil)
        #expect(flow.state.secondsLeft == nil)
        #expect(fake.services == [second: session(2)])
        #expect(fake.openSessions == [second])
        #expect(fake.advertising == [second])
        #expect(fake.calls.filter { $0 == .setting }.count == 2)
        await flow.send(.onAir(second))
        #expect(flow.state.phase == .advertising)
        #expect(flow.state.secondsLeft == 60)
        #expect(fake.countdowns == [second: 60])
    }

    @Test(arguments: [Ports.Failure.deriving, .sending])
    fileprivate func newAmountAfterFailureClearsAmountAndReason(_ failure: Ports.Failure) async {
        let fake = Ports(seconds: 30, sessions: [session(1)])
        fake.failure = failure
        let flow = Flow(fake)
        await flow.send(.lock(amount: "124.50"))
        await flow.send(.onAir(first))
        await flow.send(.clientKey(first, client, key: [7, 8]))
        let calls = fake.calls

        await flow.send(.newAmount)

        #expect(flow.state.phase == .ready)
        #expect(flow.state.amount.isEmpty)
        #expect(flow.state.reason == nil)
        #expect(flow.state.secondsLeft == nil)
        #expect(!flow.state.canRetry)
        #expect(!flow.state.canChooseNewAmount)
        #expect(fake.calls == calls)
    }

    @Test func handedOverWaitsForItsTransactionEndThenAcceptsNewAmount() async {
        let fake = Ports(seconds: 30, sessions: [session(1), session(2)])
        let flow = Flow(fake)
        await flow.send(.lock(amount: "124.50"))
        await flow.send(.onAir(first))
        await flow.send(.clientKey(first, client, key: [7, 8]))
        let handedOver = flow.state
        let calls = fake.calls
        let second = Broadcast.Attempt(number: 2)
        for event: Broadcast.Event in [
            .cancel, .retry, .newAmount, .lock(amount: "99"), .secondsLeft(first, 0),
            .onAir(first), .couldNotGoOnAir(first, reason: "late"),
            .bluetoothUnavailable(first, reason: "off"), .linkLost(first, client),
            .clientKey(first, client, key: [9]), .transactionEnded(second),
        ] {
            await flow.send(event)
            #expect(flow.state == handedOver)
            #expect(fake.calls == calls)
        }

        await flow.send(.transactionEnded(first))

        #expect(flow.state.phase == .ready)
        #expect(flow.state.amount.isEmpty)
        #expect(flow.state.reason == nil)
        #expect(flow.state.secondsLeft == nil)
        #expect(fake.calls == calls)
        await flow.send(.lock(amount: "99"))
        #expect(flow.state.phase == .goingOnAir)
        #expect(flow.state.amount == "99")
        #expect(flow.state.attempt == second)
        #expect(fake.services[second] == session(2))
    }

    @Test(arguments: [false, true])
    func sessionOpenedAfterCancelIsClosedWithoutTouchingNewAttempt(_ startAnother: Bool) async throws {
        let fake = Ports(seconds: 30, sessions: [session(1), session(2)])
        let flow = Flow(fake)
        let read = try #require(flow.accept(.lock(amount: "124.50")))
        let setting = try #require(await flow.handler.handle(read))
        let open = try #require(flow.accept(setting))
        await flow.send(.cancel)
        let lateSession = try #require(await flow.handler.handle(open))
        if startAnother { await flow.send(.lock(amount: "99")) }
        let current = flow.state

        await flow.send(lateSession)

        #expect(flow.state == current)
        #expect(!fake.openSessions.contains(first))
        #expect(fake.calls.last == .closed(first))
        if startAnother {
            let second = Broadcast.Attempt(number: 2)
            #expect(fake.openSessions == [second])
            #expect(fake.services == [second: session(2)])
            #expect(fake.advertising == [second])
        } else {
            #expect(fake.openSessions.isEmpty)
            #expect(fake.services.isEmpty)
        }
    }

    @Test(arguments: [false, true])
    func lateCountdownStartIsStoppedAfterCancelOrHandover(_ handOver: Bool) async throws {
        let fake = Ports(seconds: 30, sessions: [session(1)])
        let flow = Flow(fake)
        await flow.send(.lock(amount: "124.50"))
        let startCountdown = try #require(flow.accept(.onAir(first)))
        if handOver {
            await flow.send(.clientKey(first, client, key: [7, 8]))
        } else {
            await flow.send(.cancel)
        }
        let current = flow.state
        let lateStart = try #require(await flow.handler.handle(startCountdown))

        await flow.send(lateStart)

        #expect(flow.state == current)
        #expect(fake.countdowns.isEmpty)
        #expect(fake.calls.last == .stoppedCountdown(first))
        if handOver {
            #expect(fake.openSessions == [first])
            #expect(fake.services == [first: session(1)])
        } else {
            #expect(fake.openSessions.isEmpty)
            #expect(fake.services.isEmpty)
        }
    }
}

private let first = Broadcast.Attempt(number: 1)
private let client = Broadcast.Link(id: "payer")
private let handshakeSteps: [Broadcast.HandshakeStep] = [.stoppingAdvertising, .derivingKey, .sendingAmount]
private func session(_ id: UInt8) -> Broadcast.Session {
    Broadcast.Session(id: [id], publicKey: [id, 42])
}

@MainActor
private func expectRetired(_ fake: Ports, _ attempt: Broadcast.Attempt) {
    #expect(fake.calls.suffix(3) == [.stoppedCountdown(attempt), .retired(attempt), .closed(attempt)])
    #expect(fake.countdowns[attempt] == nil)
    #expect(fake.services[attempt] == nil)
    #expect(!fake.advertising.contains(attempt))
    #expect(!fake.openSessions.contains(attempt))
}

@MainActor
private func expectFailed(_ flow: Flow, _ fake: Ports, reason: String) {
    #expect(flow.state.phase == .failed)
    #expect(flow.state.amount == "124.50")
    #expect(flow.state.reason == reason)
    #expect(flow.state.canRetry)
    #expect(flow.state.canChooseNewAmount)
    #expect(!flow.state.canCancel)
    #expect(flow.state.secondsLeft == nil)
    expectRetired(fake, first)
}

@MainActor
private final class Flow {
    var state = Broadcast.State()
    let handler: Broadcast.Handler

    init(_ ports: Ports) {
        handler = Broadcast.Handler(session: ports, advertiser: ports, sender: ports,
                                    countdown: ports, setting: ports)
    }

    func send(_ event: Broadcast.Event) async {
        var event: Broadcast.Event? = event
        while let input = event {
            let effect = accept(input)
            event = if let effect { await handler.handle(effect) } else { nil }
        }
    }

    func accept(_ event: Broadcast.Event) -> Broadcast.Effect? {
        let (next, effect) = Broadcast.reduce(state, event)
        state = next
        return effect
    }

    func beginHandshake(stoppingAt step: Broadcast.HandshakeStep) async throws -> Broadcast.Effect {
        await send(.lock(amount: "124.50"))
        await send(.onAir(first))
        await send(.secondsLeft(first, 22))
        var effect = try #require(accept(.clientKey(first, client, key: [7, 8])))
        while state.phase != .handshake(step) {
            let event = try #require(await handler.handle(effect))
            effect = try #require(accept(event))
        }
        return effect
    }
}

@MainActor
private final class Ports: Broadcast.SessionProvider, Broadcast.Advertiser,
                           Broadcast.Sender, Broadcast.Countdown, Broadcast.CountdownSetting {
    enum Call: Equatable {
        case setting, opened(Broadcast.Attempt), served(Broadcast.Attempt, Broadcast.Session)
        case advertised(Broadcast.Attempt), stoppedAdvertising(Broadcast.Attempt)
        case derived(Broadcast.Attempt, [UInt8]), sent(Broadcast.SecureLink)
        case startedCountdown(Broadcast.Attempt, Int), stoppedCountdown(Broadcast.Attempt)
        case retired(Broadcast.Attempt), closed(Broadcast.Attempt)
    }

    enum Failure: Error, CustomStringConvertible {
        case serving, advertising, deriving, sending
        var description: String {
            switch self {
            case .serving: "service unavailable"
            case .advertising: "radio refused advertising"
            case .deriving: "invalid client key"
            case .sending: "amount exceeds link capacity"
            }
        }
    }

    var duration: Int
    var sessions: [Broadcast.Session]
    var calls: [Call] = []
    var countdowns: [Broadcast.Attempt: Int] = [:]
    var services: [Broadcast.Attempt: Broadcast.Session] = [:]
    var advertising: Set<Broadcast.Attempt> = []
    var openSessions: Set<Broadcast.Attempt> = []
    var failure: Failure?

    init(seconds: Int, sessions: [Broadcast.Session]) {
        duration = seconds
        self.sessions = sessions
    }

    func seconds() -> Int { calls.append(.setting); return duration }
    func open(for attempt: Broadcast.Attempt) -> Broadcast.Session {
        calls.append(.opened(attempt))
        openSessions.insert(attempt)
        return sessions.removeFirst()
    }
    func derive(clientKey: [UInt8], for attempt: Broadcast.Attempt) throws {
        calls.append(.derived(attempt, clientKey))
        if failure == .deriving { throw Failure.deriving }
    }
    func close(_ attempt: Broadcast.Attempt) {
        calls.append(.closed(attempt))
        openSessions.remove(attempt)
    }
    func serve(_ session: Broadcast.Session, for attempt: Broadcast.Attempt) async throws {
        calls.append(.served(attempt, session))
        if failure == .serving { throw Failure.serving }
        services[attempt] = session
    }
    func advertise(_ attempt: Broadcast.Attempt) throws {
        calls.append(.advertised(attempt))
        if failure == .advertising { throw Failure.advertising }
        advertising.insert(attempt)
    }
    func stopAdvertising(_ attempt: Broadcast.Attempt) {
        calls.append(.stoppedAdvertising(attempt))
        advertising.remove(attempt)
    }
    func retire(_ attempt: Broadcast.Attempt) {
        calls.append(.retired(attempt))
        services.removeValue(forKey: attempt)
        advertising.remove(attempt)
    }
    func sendAmount(_ secureLink: Broadcast.SecureLink) throws {
        calls.append(.sent(secureLink))
        if failure == .sending { throw Failure.sending }
    }
    func start(seconds: Int, for attempt: Broadcast.Attempt) {
        calls.append(.startedCountdown(attempt, seconds))
        countdowns[attempt] = seconds
    }
    func stop(_ attempt: Broadcast.Attempt) {
        calls.append(.stoppedCountdown(attempt))
        countdowns.removeValue(forKey: attempt)
    }
}
