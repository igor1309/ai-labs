import HostBroadcast
import Testing

private typealias Broadcast = HostBroadcast

@MainActor
struct HostBroadcastTests {
    @Test func synchronousEffectsRunBeforeReturningTheirStreams() async {
        let cases: [(Broadcast.Effect, Ports.Call, [Broadcast.Event])] = [
            (.readCountdown(first), .setting, [.countdownRead(first, 30)]),
            (.openSession(first), .opened(first), [.sessionOpened(first, session(1))]),
            (.advertise(first), .advertised(first), [.advertisingRequested(first)]),
            (.startCountdown(first, 30), .startedCountdown(first, 30), [.countdownStarted(first)]),
            (.stopCountdown(first, retire: true), .stoppedCountdown(first), [.countdownStopped(first, retire: true)]),
            (.retire(first), .retired(first), [.retired(first)]),
            (.closeSession(first), .closed(first), []),
            (.stopAdvertising(first), .stoppedAdvertising(first), [.advertisingStopped(first)]),
            (.deriveKey(first, [7, 8]), .derived(first, [7, 8]), [.keyDerived(first)]),
            (.sealAmount(first, "124.50"), .sealed(first, "124.50"), [.amountSealed(first, protectedAmount)]),
            (.sendAmount(first, client, protectedAmount), .sent(first, client, protectedAmount), [.amountSent(first)]),
        ]
        for (effect, call, expected) in cases {
            let fake = Ports(seconds: 30, sessions: [session(1)], protectedAmounts: ["124.50": protectedAmount])
            let handler = Broadcast.Handler(session: fake, advertiser: fake, sender: fake,
                                            countdown: fake, setting: fake)
            let stream = handler.handle(effect)
            #expect(fake.calls == [call])
            #expect(await collect(stream) == expected)
        }
    }

    @Test(arguments: [false, true])
    func servingStartsInlineAndEndsWithItsStream(_ cancel: Bool) async {
        let fake = Ports(seconds: 30, sessions: [], protectedAmounts: [:])
        let gate = AsyncStream<Void>.makeStream()
        let completed = AsyncStream<Bool>.makeStream()
        defer { gate.continuation.finish() }
        fake.onServe = {
            for await _ in gate.stream { }
            completed.continuation.yield(Task.isCancelled)
            completed.continuation.finish()
        }
        let handler = Broadcast.Handler(session: fake, advertiser: fake, sender: fake,
                                        countdown: fake, setting: fake)
        let stream = handler.handle(.serve(first, session(1)))
        #expect(fake.calls == [.served(first, session(1))])
        let consuming = Task { await collect(stream) }
        if cancel { consuming.cancel() } else { gate.continuation.finish() }
        #expect(await consuming.value == (cancel ? [] : [.served(first)]))
        var cancellations: [Bool] = []
        for await cancelled in completed.stream { cancellations.append(cancelled) }
        #expect(cancellations == [cancel])
    }

    @Test(arguments: [false, true])
    func startupFailureReportsTheAttemptAndOriginalReason(_ advertising: Bool) async {
        let fake = Ports(seconds: 30, sessions: [], protectedAmounts: [:])
        fake.failure = advertising ? .advertising : .serving
        let handler = Broadcast.Handler(session: fake, advertiser: fake, sender: fake,
                                        countdown: fake, setting: fake)
        let effect: Broadcast.Effect = advertising ? .advertise(first) : .serve(first, session(1))
        let reason = advertising ? "radio refused advertising" : "service unavailable"

        let events = await collect(handler.handle(effect))

        #expect(fake.calls == [advertising ? .advertised(first) : .served(first, session(1))])
        #expect(events == [.couldNotGoOnAir(first, reason: reason)])
    }

    @Test(arguments: [Ports.Failure.deriving, .sealing, .sending])
    fileprivate func handshakeStepFailureReportsTheAttemptAndOriginalReason(_ failure: Ports.Failure) async {
        let fake = Ports(seconds: 30, sessions: [], protectedAmounts: ["124.50": protectedAmount])
        fake.failure = failure
        let handler = Broadcast.Handler(session: fake, advertiser: fake, sender: fake,
                                        countdown: fake, setting: fake)
        let (effect, call): (Broadcast.Effect, Ports.Call) = switch failure {
        case .deriving: (.deriveKey(first, [7, 8]), .derived(first, [7, 8]))
        case .sealing: (.sealAmount(first, "124.50"), .sealed(first, "124.50"))
        default: (.sendAmount(first, client, protectedAmount), .sent(first, client, protectedAmount))
        }

        let events = await collect(handler.handle(effect))

        #expect(fake.calls == [call])
        #expect(events == [.handshakeFailed(first, reason: failure.description)])
    }

    @Test(arguments: successfulAmounts)
    fileprivate func sealAndSendCarryEachAmountsOwnBytes(_ input: LockedAmount) async {
        let fake = Ports(seconds: 30, sessions: [], protectedAmounts: [input.amount: input.protected])
        let handler = Broadcast.Handler(session: fake, advertiser: fake, sender: fake,
                                        countdown: fake, setting: fake)

        let sealed = await collect(handler.handle(.sealAmount(first, input.amount)))
        let sent = await collect(handler.handle(.sendAmount(first, client, input.protected)))

        #expect(fake.calls == [.sealed(first, input.amount), .sent(first, client, input.protected)])
        #expect(sealed == [.amountSealed(first, input.protected)])
        #expect(sent == [.amountSent(first)])
    }
}

private struct LockedAmount: Sendable {
    let amount: String
    let protected: Broadcast.ProtectedAmount
}

private let successfulAmounts: [LockedAmount] = [
    .init(amount: "124.50", protected: protectedAmount),
    .init(amount: "99", protected: replacementProtectedAmount),
    .init(amount: "0.01", protected: .init(bytes: [8, 19, 71, 254])),
]

private let replacementProtectedAmount = Broadcast.ProtectedAmount(bytes: [6, 43, 128])
private let protectedAmount = Broadcast.ProtectedAmount(bytes: [91, 37, 206])
private let first = Broadcast.Attempt(number: 1)
private let client = Broadcast.Link(id: "payer")
private let handshakeSteps: [Broadcast.HandshakeStep] = [.stoppingAdvertising, .derivingKey, .sealingAmount, .sendingAmount]
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
    private let handler: Broadcast.Handler

    init(_ ports: Ports) {
        handler = Broadcast.Handler(session: ports, advertiser: ports, sender: ports,
                                    countdown: ports, setting: ports)
    }

    func handle(_ effect: Broadcast.Effect) async -> Broadcast.Event? {
        let events = await collect(handler.handle(effect))
        #expect(events.count <= 1)
        return events.first
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

    func start(_ event: Broadcast.Event) -> AsyncStream<Broadcast.Event>? {
        accept(event).map { handler.handle($0) }
    }

    func drain(_ streams: [AsyncStream<Broadcast.Event>]) async {
        var pending = streams
        while !pending.isEmpty {
            for await event in pending.removeFirst() {
                if let stream = start(event) { pending.append(stream) }
            }
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
    let protectedAmounts: [String: Broadcast.ProtectedAmount]
    var calls: [Call] = []
    var countdowns: [Broadcast.Attempt: Int] = [:]
    var services: [Broadcast.Attempt: Broadcast.Session] = [:]
    var advertising: Set<Broadcast.Attempt> = []
    var openSessions: Set<Broadcast.Attempt> = []
    var failure: Failure?
    var onServe: (() async -> Void)?

    init(seconds: Int, sessions: [Broadcast.Session],
         protectedAmounts: [String: Broadcast.ProtectedAmount]) {
        duration = seconds
        self.sessions = sessions
        self.protectedAmounts = protectedAmounts
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
        return try #require(protectedAmounts[amount])
    }
    func close(_ attempt: Broadcast.Attempt) {
        calls.append(.closed(attempt))
        openSessions.remove(attempt)
    }
    func serve(_ session: Broadcast.Session, for attempt: Broadcast.Attempt) async throws {
        calls.append(.served(attempt, session))
        if let onServe { await onServe() }
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

@MainActor
private func collect(_ stream: AsyncStream<Broadcast.Event>) async -> [Broadcast.Event] {
    var events: [Broadcast.Event] = []
    for await event in stream { events.append(event) }
    return events
}
