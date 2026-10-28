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
        let result = await flow.handle(try #require(effect))
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
        #expect(fake.calls.suffix(5) == [
            .stoppedAdvertising(first), .derived(first, [7, 8]),
            .sealed(first, "124.50"), .sent(first, client, protectedAmount), .stoppedCountdown(first),
        ])
        #expect(fake.countdowns.isEmpty)
        #expect(fake.advertising.isEmpty)
        #expect(fake.services == [first: session(1)])
        #expect(fake.openSessions == [first])
    }

    @Test func keyDerivationQueuesFirstSeal() async throws {
        let fake = Ports(seconds: 30, sessions: [session(1)])
        let flow = Flow(fake)
        let derive = try await flow.beginHandshake(stoppingAt: .derivingKey)
        let result = try #require(await flow.handle(derive))

        let seal = flow.accept(result)

        #expect(flow.state.phase == .handshake(.sealingAmount))
        #expect(seal == .sealAmount(first, "124.50"))
        #expect(flow.state.secondsLeft == 22)
    }

    @Test func amountSealFailureOffersRetryAndNewAmount() async {
        let fake = Ports(seconds: 30, sessions: [session(1)])
        fake.failure = .sealing
        let flow = Flow(fake)
        await flow.send(.lock(amount: "124.50"))
        await flow.send(.onAir(first))

        await flow.send(.clientKey(first, client, key: [7, 8]))

        expectFailed(flow, fake, reason: Ports.Failure.sealing.description)
        #expect(fake.calls.contains(.sealed(first, "124.50")))
        #expect(!fake.calls.contains { if case .sent = $0 { true } else { false } })
    }

    @Test func queuedSendAfterExpiryDoesNotReachClient() async throws {
        let fake = Ports(seconds: 30, sessions: [session(1)])
        let flow = Flow(fake)
        let send = try await flow.beginHandshake(stoppingAt: .sendingAmount)
        let cleanup = try #require(flow.accept(.secondsLeft(first, 0)))
        let timedOut = flow.state
        let calls = fake.calls
        let resources = fake.resources

        let result = await flow.handle(send)

        #expect(result == nil)
        #expect(fake.calls == calls)
        #expect(fake.resources == resources)
        #expect(flow.state == timedOut)
        #expect(flow.state.phase == .timedOut)
        await flow.run(cleanup)
        expectRetired(fake, first)
    }

    @Test(arguments: [false, true])
    func queuedSendAfterHandoverOrReplacementIsRejected(_ replace: Bool) async throws {
        let fake = Ports(seconds: 30, sessions: [session(1), session(2)])
        let flow = Flow(fake)
        let oldSend = try await flow.beginHandshake(stoppingAt: .sendingAmount)
        var replacementSend: Broadcast.Effect?
        let second = Broadcast.Attempt(number: 2)
        if replace {
            await flow.send(.secondsLeft(first, 0))
            await flow.send(.lock(amount: "99"))
            await flow.send(.onAir(second))
            replacementSend = try await flow.clientHandshake(second, stoppingAt: .sendingAmount)
        } else {
            await flow.send(.amountSent(first))
        }
        let current = flow.state
        let calls = fake.calls
        let resources = fake.resources

        let result = await flow.handle(oldSend)

        #expect(result == nil)
        #expect(flow.state == current)
        #expect(fake.calls == calls)
        #expect(fake.resources == resources)
        if let replacementSend {
            await flow.run(replacementSend)
            guard case .handedOver(let secure) = flow.state.phase else {
                Issue.record("Expected the replacement to hand over")
                return
            }
            #expect(secure.attempt == second)
            #expect(secure.amount == "99")
            #expect(fake.calls.suffix(2) == [.sent(second, client, protectedAmount), .stoppedCountdown(second)])
        }
    }

    @Test(arguments: handshakeSteps)
    fileprivate func handshakeDoesNotOfferCancelOrAnotherAttempt(_ step: Broadcast.HandshakeStep) async throws {
        let fake = Ports(seconds: 30, sessions: [session(1)])
        let flow = Flow(fake)
        _ = try await flow.beginHandshake(stoppingAt: step)
        let handshake = flow.state
        let calls = fake.calls

        for event: Broadcast.Event in [.cancel, .retry, .newAmount, .lock(amount: "99"),
                                      .clientKey(first, Broadcast.Link(id: "other"), key: [9])] {
            #expect(flow.accept(event) == nil)
            #expect(flow.state == handshake)
            #expect(fake.calls == calls)
        }
        #expect(!flow.state.canCancel)
        #expect(!flow.state.canRetry)
        #expect(!flow.state.canChooseNewAmount)
    }

    @Test(arguments: handshakeSteps)
    fileprivate func unrelatedLinkLossLeavesHandshakeIntact(_ step: Broadcast.HandshakeStep) async throws {
        let fake = Ports(seconds: 30, sessions: [session(1)])
        let flow = Flow(fake)
        _ = try await flow.beginHandshake(stoppingAt: step)
        let current = flow.state
        let calls = fake.calls
        let resources = fake.resources

        await flow.send(.linkLost(first, Broadcast.Link(id: "other")))

        #expect(flow.state == current)
        #expect(fake.calls == calls)
        #expect(fake.resources == resources)
    }

    @Test(arguments: staleEvents)
    fileprivate func staleEventsCannotChangeReplacementAttempt(_ input: StaleEvent) async throws {
        let fake = Ports(seconds: 30, sessions: [session(1), session(2)])
        let flow = Flow(fake)
        try await flow.prepareReplacement(stoppingAt: input.phase)
        let current = flow.state
        let calls = fake.calls
        let resources = fake.resources

        await flow.send(input.event)

        #expect(flow.state == current)
        #expect(fake.calls == calls)
        #expect(fake.resources == resources)
    }

    @Test(arguments: lateAcquisitions)
    fileprivate func lateAcquisitionsReleaseOnlyOldResources(_ input: LateAcquisition) async throws {
        let fake = Ports(seconds: 30, sessions: [session(1), session(2), session(3)])
        let flow = Flow(fake)
        try await flow.prepareReplacement(stoppingAt: input.phase)
        let current = flow.state
        let resources = fake.resources
        let event: Broadcast.Event
        let release: Ports.Call
        if input.session {
            event = .sessionOpened(first, fake.open(for: first))
            release = .closed(first)
        } else {
            fake.start(seconds: 22, for: first)
            event = .countdownStarted(first)
            release = .stoppedCountdown(first)
        }
        let calls = fake.calls

        await flow.send(event)

        #expect(flow.state == current)
        #expect(fake.calls == calls + [release])
        #expect(fake.resources == resources)
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
        #expect(fake.calls.contains(.sealed(first, "124.50")))
        #expect(fake.calls.contains(.sent(first, client, protectedAmount)))
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
        for event: Broadcast.Event in [.advertisingStopped(first), .keyDerived(first),
                                       .amountSealed(first, protectedAmount), .amountSent(first)] {
            await flow.send(event)
            #expect(flow.state == timedOut)
            #expect(fake.calls == calls)
        }
    }

    @Test(arguments: [Ports.Failure.deriving, .sealing, .sending])
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

    @Test(arguments: [Ports.Failure.deriving, .sealing, .sending])
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
        let setting = try #require(await flow.handle(read))
        let open = try #require(flow.accept(setting))
        await flow.send(.cancel)
        let lateSession = try #require(await flow.handle(open))
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
        let lateStart = try #require(await flow.handle(startCountdown))

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

private let protectedAmount = Broadcast.ProtectedAmount(bytes: [91, 37, 206])
private let first = Broadcast.Attempt(number: 1)
private let client = Broadcast.Link(id: "payer")
private let handshakeSteps: [Broadcast.HandshakeStep] = [.stoppingAdvertising, .derivingKey, .sealingAmount, .sendingAmount]
private func session(_ id: UInt8) -> Broadcast.Session {
    Broadcast.Session(id: [id], publicKey: [id, 42])
}

private enum ReplacementPhase: Equatable, Sendable {
    case readingSetting, openingSession, serving, awaitingAir, advertising
    case handshake(Broadcast.HandshakeStep)
}

private struct StaleEvent: Sendable {
    let phase: ReplacementPhase
    let event: Broadcast.Event
}

private let staleEvents: [StaleEvent] = [
    .init(phase: .readingSetting, event: .countdownRead(first, 99)),
    .init(phase: .serving, event: .served(first)),
    .init(phase: .awaitingAir, event: .onAir(first)),
    .init(phase: .advertising, event: .couldNotGoOnAir(first, reason: "old failure")),
    .init(phase: .advertising, event: .bluetoothUnavailable(first, reason: "old loss")),
    .init(phase: .advertising, event: .secondsLeft(first, 0)),
    .init(phase: .advertising, event: .clientKey(first, client, key: [9])),
    .init(phase: .handshake(.stoppingAdvertising), event: .advertisingStopped(first)),
    .init(phase: .handshake(.derivingKey), event: .keyDerived(first)),
    .init(phase: .handshake(.sealingAmount), event: .amountSealed(first, protectedAmount)),
    .init(phase: .handshake(.sendingAmount), event: .amountSent(first)),
] + handshakeSteps.flatMap { step in
    [Broadcast.Event.bluetoothUnavailable(first, reason: "old loss"),
     .secondsLeft(first, 0), .handshakeFailed(first, reason: "old failure"),
     .linkLost(first, client)].map { StaleEvent(phase: .handshake(step), event: $0) }
}

private struct LateAcquisition: Sendable {
    let phase: ReplacementPhase
    let session: Bool
}

private let lateAcquisitions: [LateAcquisition] = [
    .init(phase: .openingSession, session: true),
    .init(phase: .advertising, session: true),
    .init(phase: .advertising, session: false),
] + handshakeSteps.flatMap { step in
    [LateAcquisition(phase: .handshake(step), session: true),
     LateAcquisition(phase: .handshake(step), session: false)]
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
    private let handler: Broadcast.Handler

    init(_ ports: Ports) {
        handler = Broadcast.Handler(session: ports, advertiser: ports, sender: ports,
                                    countdown: ports, setting: ports)
    }

    func handle(_ effect: Broadcast.Effect) async -> Broadcast.Event? {
        await handler.handle(effect, currentState: { state })
    }

    func send(_ event: Broadcast.Event) async {
        var event: Broadcast.Event? = event
        while let input = event {
            let effect = accept(input)
            event = if let effect { await handle(effect) } else { nil }
        }
    }

    func run(_ effect: Broadcast.Effect) async {
        if let event = await handle(effect) { await send(event) }
    }

    func accept(_ event: Broadcast.Event) -> Broadcast.Effect? {
        let (next, effect) = Broadcast.reduce(state, event)
        state = next
        return effect
    }

    func prepareReplacement(stoppingAt phase: ReplacementPhase) async throws {
        await send(.lock(amount: "124.50"))
        await send(.cancel)
        var effect = try #require(accept(.lock(amount: "99")))
        for preparation: ReplacementPhase in [.readingSetting, .openingSession, .serving, .awaitingAir] {
            if phase == preparation { return }
            let event = try #require(await handle(effect))
            if let next = accept(event) { effect = next }
        }
        let second = Broadcast.Attempt(number: 2)
        await send(.onAir(second))
        if phase == .advertising { return }
        guard case .handshake(let step) = phase else {
            Issue.record("Expected a handshake destination")
            return
        }
        _ = try await clientHandshake(second, stoppingAt: step)
    }

    func beginHandshake(stoppingAt step: Broadcast.HandshakeStep) async throws -> Broadcast.Effect {
        await send(.lock(amount: "124.50"))
        await send(.onAir(first))
        await send(.secondsLeft(first, 22))
        return try await clientHandshake(first, stoppingAt: step)
    }

    func clientHandshake(_ attempt: Broadcast.Attempt,
                         stoppingAt step: Broadcast.HandshakeStep) async throws -> Broadcast.Effect {
        var effect = try #require(accept(.clientKey(attempt, client, key: [7, 8])))
        while state.phase != .handshake(step) {
            let event = try #require(await handle(effect))
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
        case derived(Broadcast.Attempt, [UInt8]), sealed(Broadcast.Attempt, String)
        case sent(Broadcast.Attempt, Broadcast.Link, Broadcast.ProtectedAmount)
        case startedCountdown(Broadcast.Attempt, Int), stoppedCountdown(Broadcast.Attempt)
        case retired(Broadcast.Attempt), closed(Broadcast.Attempt)
    }

    struct Resources: Equatable {
        let countdowns: [Broadcast.Attempt: Int]
        let services: [Broadcast.Attempt: Broadcast.Session]
        let advertising: Set<Broadcast.Attempt>
        let openSessions: Set<Broadcast.Attempt>
    }

    var resources: Resources {
        Resources(countdowns: countdowns, services: services,
                  advertising: advertising, openSessions: openSessions)
    }

    enum Failure: Error, CustomStringConvertible {
        case serving, advertising, deriving, sealing, sending
        var description: String {
            switch self {
            case .serving: "service unavailable"
            case .advertising: "radio refused advertising"
            case .deriving: "invalid client key"
            case .sealing: "amount protection failed"
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
    func seal(amount: String, for attempt: Broadcast.Attempt) throws -> Broadcast.ProtectedAmount {
        calls.append(.sealed(attempt, amount))
        if failure == .sealing { throw Failure.sealing }
        return protectedAmount
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
    func sendAmount(_ message: Broadcast.ProtectedAmount, to link: Broadcast.Link,
                    for attempt: Broadcast.Attempt) throws {
        calls.append(.sent(attempt, link, message))
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
