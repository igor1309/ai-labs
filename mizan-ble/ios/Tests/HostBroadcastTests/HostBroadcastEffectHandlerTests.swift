import HostBroadcast
import Testing

private typealias Broadcast = HostBroadcast

private let attempt = HostBroadcast.Attempt(number: 3)
private let session = HostBroadcast.Session(id: [3], publicKey: [3, 42])
private let client = HostBroadcast.Link(id: "payer")
private let sealed = HostBroadcast.ProtectedAmount(bytes: [91, 37, 206])

@MainActor
struct HostBroadcastEffectHandlerTests {
    // Each effect calls its one collaborator with the effect's payload, and nothing else.
    @Test(arguments: [
        (HostBroadcast.Effect.readCountdown(attempt), Call.readSetting),
        (.openSession(attempt), .open(attempt)),
        (.advertise(attempt), .advertise(attempt)),
        (.startCountdown(attempt, 90), .startCountdown(90, attempt)),
        (.stopCountdown(attempt, retire: true), .stopCountdown(attempt)),
        (.retire(attempt), .retire(attempt)),
        (.closeSession(attempt), .close(attempt)),
        (.stopAdvertising(attempt), .stopAdvertising(attempt)),
        (.deriveKey(attempt, [7, 8]), .derive([7, 8], attempt)),
        (.sealAmount(attempt, "124.50"), .seal("124.50", attempt)),
        (.sendAmount(attempt, client, sealed), .send(sealed, client, attempt)),
    ])
    func effectCallsOnlyItsCollaboratorWithItsPayload(effect: HostBroadcast.Effect, call: Call) async {
        let (sut, spies) = makeSUT()

        _ = await sut.handle(effect)

        #expect(spies.calls == [call])
    }

    @Test(arguments: [
        (HostBroadcast.Effect.advertise(attempt), HostBroadcast.Event.advertisingRequested(attempt)),
        (.startCountdown(attempt, 90), .countdownStarted(attempt)),
        (.stopCountdown(attempt, retire: true), .countdownStopped(attempt, retire: true)),
        (.stopCountdown(attempt, retire: false), .countdownStopped(attempt, retire: false)),
        (.retire(attempt), .retired(attempt)),
        (.stopAdvertising(attempt), .advertisingStopped(attempt)),
        (.deriveKey(attempt, [7, 8]), .keyDerived(attempt)),
        (.sendAmount(attempt, client, sealed), .amountSent(attempt)),
    ])
    func commandDeliversItsCompletionForItsAttempt(effect: HostBroadcast.Effect, event: HostBroadcast.Event) async {
        let (sut, _) = makeSUT()

        await expect(sut, with: effect, toDeliver: event)
    }

    @Test(arguments: [30, 90])
    func readCountdownDeliversTheSetting(seconds: Int) async {
        let (sut, spies) = makeSUT()
        spies.countdownSeconds = seconds

        await expect(sut, with: .readCountdown(attempt), toDeliver: .countdownRead(attempt, seconds))
    }

    @Test func openSessionDeliversTheOpenedSession() async {
        let (sut, spies) = makeSUT()
        spies.opened = session

        await expect(sut, with: .openSession(attempt), toDeliver: .sessionOpened(attempt, session))
    }

    @Test(arguments: [
        ("124.50", sealed),
        ("99", HostBroadcast.ProtectedAmount(bytes: [6, 43, 128])),
        ("0.01", HostBroadcast.ProtectedAmount(bytes: [8, 19, 71, 254])),
    ])
    func sealAndSendCarryEachAmountsOwnBytes(amount: String, protected: HostBroadcast.ProtectedAmount) async {
        let (sut, spies) = makeSUT()
        spies.sealed = protected

        await expect(sut, with: .sealAmount(attempt, amount), toDeliver: .amountSealed(attempt, protected))
        await expect(sut, with: .sendAmount(attempt, client, protected), toDeliver: .amountSent(attempt))

        #expect(spies.calls == [.seal(amount, attempt), .send(protected, client, attempt)])
    }

    @Test func closeSessionDeliversNothing() async {
        let (sut, _) = makeSUT()

        await expect(sut, with: .closeSession(attempt), toDeliver: nil)
    }

    @Test func serveCallsTheAdvertiserWithTheSession() async {
        let (sut, spies) = makeSUT()

        await expect(sut, with: .serve(attempt, session), toDeliver: .served(attempt)) {
            spies.completeServe(with: nil)
        }

        #expect(spies.calls == [.serve(session, attempt)])
    }

    @Test(arguments: [false, true])
    func serveStartsInlineAndSeesItsTasksCancellation(cancel: Bool) async {
        let (sut, spies) = makeSUT()

        let handling = Task.immediate { await sut.handle(.serve(attempt, session)) }
        #expect(spies.calls == [.serve(session, attempt)])
        if cancel { handling.cancel() }
        spies.completeServe(with: nil)

        #expect(await handling.value == .served(attempt))
        #expect(spies.servedWhileCancelled == cancel)
    }

    @Test func serveFailureCannotGoOnAir() async {
        let (sut, spies) = makeSUT()

        await expect(sut, with: .serve(attempt, session), toDeliver: .couldNotGoOnAir(attempt, reason: "refused")) {
            spies.completeServe(with: Failure(description: "refused"))
        }

        #expect(spies.calls == [.serve(session, attempt)])
    }

    @Test func advertiseFailureCannotGoOnAir() async {
        let (sut, spies) = makeSUT()
        spies.failing = Failure(description: "busy")

        await expect(sut, with: .advertise(attempt), toDeliver: .couldNotGoOnAir(attempt, reason: "busy"))

        #expect(spies.calls == [.advertise(attempt)])
    }

    @Test(arguments: [
        (HostBroadcast.Effect.deriveKey(attempt, [7, 8]), Call.derive([7, 8], attempt), "invalid client key"),
        (.sealAmount(attempt, "124.50"), .seal("124.50", attempt), "amount protection failed"),
        (.sendAmount(attempt, client, sealed), .send(sealed, client, attempt), "amount exceeds link capacity"),
    ])
    func handshakeStepFailureFailsTheHandshake(effect: HostBroadcast.Effect, call: Call, reason: String) async {
        let (sut, spies) = makeSUT()
        spies.failing = Failure(description: reason)

        await expect(sut, with: effect, toDeliver: .handshakeFailed(attempt, reason: reason))

        #expect(spies.calls == [call])
    }
}

// MARK: - Helpers

enum Call: Equatable, Sendable {
    case readSetting, open(HostBroadcast.Attempt), close(HostBroadcast.Attempt)
    case derive([UInt8], HostBroadcast.Attempt), seal(String, HostBroadcast.Attempt)
    case serve(HostBroadcast.Session, HostBroadcast.Attempt), advertise(HostBroadcast.Attempt)
    case stopAdvertising(HostBroadcast.Attempt), retire(HostBroadcast.Attempt)
    case send(HostBroadcast.ProtectedAmount, HostBroadcast.Link, HostBroadcast.Attempt)
    case startCountdown(Int, HostBroadcast.Attempt), stopCountdown(HostBroadcast.Attempt)
}

private struct Failure: Error, CustomStringConvertible {
    let description: String
}

@MainActor
private func makeSUT() -> (HostBroadcast.Handler, Spies) {
    let spies = Spies()
    let sut = HostBroadcast.Handler(
        session: spies, advertiser: spies, sender: spies, countdown: spies, setting: spies
    )
    return (sut, spies)
}

@MainActor
private func expect(
    _ sut: HostBroadcast.Handler,
    with effect: HostBroadcast.Effect,
    toDeliver expected: HostBroadcast.Event?,
    on action: @MainActor () -> Void = {},
    sourceLocation: SourceLocation = #_sourceLocation
) async {
    let event = Task { await sut.handle(effect) }
    action()
    #expect(await event.value == expected, sourceLocation: sourceLocation)
}

/// One spy for the five collaborators, so a test sees that an effect touched no other.
/// A serve waits until the test completes it, in either order.
@MainActor
private final class Spies: HostBroadcast.SessionProvider, HostBroadcast.Advertiser, HostBroadcast.Sender,
    HostBroadcast.Countdown, HostBroadcast.CountdownSetting {
    private(set) var calls: [Call] = []
    var countdownSeconds = 90
    var opened = HostBroadcast.Session(id: [1], publicKey: [1])
    var sealed = HostBroadcast.ProtectedAmount(bytes: [1])
    var failing: Failure?
    private(set) var servedWhileCancelled: Bool?
    private var serving: CheckedContinuation<Void, any Error>?
    private var served: Result<Void, any Error>?

    func seconds() -> Int {
        calls.append(.readSetting)
        return countdownSeconds
    }

    func open(for attempt: HostBroadcast.Attempt) -> HostBroadcast.Session {
        calls.append(.open(attempt))
        return opened
    }

    func derive(clientKey: [UInt8], for attempt: HostBroadcast.Attempt) throws {
        calls.append(.derive(clientKey, attempt))
        if let failing { throw failing }
    }

    func seal(amount: String, for attempt: HostBroadcast.Attempt) throws -> HostBroadcast.ProtectedAmount {
        calls.append(.seal(amount, attempt))
        if let failing { throw failing }
        return sealed
    }

    func close(_ attempt: HostBroadcast.Attempt) { calls.append(.close(attempt)) }

    func serve(_ session: HostBroadcast.Session, for attempt: HostBroadcast.Attempt) async throws {
        calls.append(.serve(session, attempt))
        if let served { return try served.get() }
        try await withCheckedThrowingContinuation { serving = $0 }
        servedWhileCancelled = Task.isCancelled
    }

    func completeServe(with error: (any Error)?) {
        let result: Result<Void, any Error> = error.map { .failure($0) } ?? .success(())
        if let serving {
            self.serving = nil
            serving.resume(with: result)
        } else {
            served = result
        }
    }

    func advertise(_ attempt: HostBroadcast.Attempt) throws {
        calls.append(.advertise(attempt))
        if let failing { throw failing }
    }

    func stopAdvertising(_ attempt: HostBroadcast.Attempt) { calls.append(.stopAdvertising(attempt)) }
    func retire(_ attempt: HostBroadcast.Attempt) { calls.append(.retire(attempt)) }

    func sendAmount(
        _ message: HostBroadcast.ProtectedAmount, to link: HostBroadcast.Link, for attempt: HostBroadcast.Attempt
    ) throws {
        calls.append(.send(message, link, attempt))
        if let failing { throw failing }
    }

    func start(seconds: Int, for attempt: HostBroadcast.Attempt) { calls.append(.startCountdown(seconds, attempt)) }
    func stop(_ attempt: HostBroadcast.Attempt) { calls.append(.stopCountdown(attempt)) }
}
