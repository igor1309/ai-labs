import HostBroadcast
import Testing

private typealias State = HostBroadcast.State
private typealias Event = HostBroadcast.Event
private typealias Effect = HostBroadcast.Effect

private let current = HostBroadcast.Attempt(number: 2)
private let stale = HostBroadcast.Attempt(number: 1)
private let session = HostBroadcast.Session(id: [2], publicKey: [2, 42])
private let client = HostBroadcast.Link(id: "payer")

struct HostBroadcastReducerTests {
    @Test func startsReadyWithNoAmount() {
        #expect(State() == State(phase: .ready, amount: "", nextAttempt: 0))
    }

    // MARK: - Locking an amount

    @Test(arguments: [HostBroadcast.Phase.ready, .timedOut])
    func lockingStartsANewAttemptByReadingTheCountdown(phase: HostBroadcast.Phase) {
        let state = State(phase: phase, reason: "earlier", nextAttempt: 1)

        assert(state, .lock(amount: "124.50")) {
            $0.phase = .goingOnAir
            $0.amount = "124.50"
            $0.reason = nil
            $0.attempt = current
            $0.nextAttempt = 2
            $0.preparation = .readingSetting
        }
        assert(state, .lock(amount: "124.50"), delivers: .readCountdown(current))
    }

    @Test(arguments: [HostBroadcast.Phase.goingOnAir, .advertising, .failed])
    func lockingWhileAnAttemptIsLiveOrFailedIsIgnored(phase: HostBroadcast.Phase) {
        let state = makeState(phase: phase)

        assert(state, .lock(amount: "1.00"))
        assert(state, .lock(amount: "1.00"), delivers: nil)
    }

    @Test func countdownReadOpensASession() {
        let state = makeState(phase: .goingOnAir, preparation: .readingSetting)

        assert(state, .countdownRead(current, 90)) {
            $0.duration = 90
            $0.preparation = .openingSession
        }
        assert(state, .countdownRead(current, 90), delivers: .openSession(current))
    }

    @Test func openedSessionIsServed() {
        let state = makeState(phase: .goingOnAir, duration: 90, preparation: .openingSession)

        assert(state, .sessionOpened(current, session)) {
            $0.session = session
            $0.preparation = .serving
        }
        assert(state, .sessionOpened(current, session), delivers: .serve(current, session))
    }

    @Test func servedSessionIsAdvertised() {
        let state = makeState(phase: .goingOnAir, duration: 90, session: session, preparation: .serving)

        assert(state, .served(current)) { $0.preparation = .awaitingAir }
        assert(state, .served(current), delivers: .advertise(current))
    }

    @Test(arguments: [30, 90, 300])
    func onAirStartsTheFullCountdown(seconds: Int) {
        let state = makeState(phase: .goingOnAir, duration: seconds, session: session, preparation: .awaitingAir)

        assert(state, .onAir(current)) {
            $0.preparation = nil
            $0.phase = .advertising
            $0.secondsLeft = seconds
        }
        assert(state, .onAir(current), delivers: .startCountdown(current, seconds))
    }

    @Test(arguments: StepOutOfTurn.all)
    func preparationStepsOutOfTurnAreIgnored(step: StepOutOfTurn) {
        let state = makeState(phase: .goingOnAir, duration: 90, preparation: step.preparation)

        assert(state, step.event)
        assert(state, step.event, delivers: nil)
    }

    // MARK: - Going on air fails or is cancelled

    @Test(arguments: [HostBroadcast.Phase.goingOnAir, .advertising])
    func cancelUnlocksTheAmountAndRetiresTheAttempt(phase: HostBroadcast.Phase) {
        let state = makeState(phase: phase, secondsLeft: phase == .advertising ? 40 : nil, session: session)

        assert(state, .cancel) {
            $0.phase = .ready
            $0.secondsLeft = nil
            $0.attempt = nil
            $0.duration = nil
            $0.session = nil
        }
        assert(state, .cancel, delivers: .stopCountdown(current, retire: true))
    }

    @Test(arguments: [HostBroadcast.Phase.ready, .failed, .timedOut, .handshake(.derivingKey)])
    func cancelOutsideGoingOnAirIsIgnored(phase: HostBroadcast.Phase) {
        let state = makeState(phase: phase)

        assert(state, .cancel)
        assert(state, .cancel, delivers: nil)
    }

    @Test(arguments: [HostBroadcast.Phase.goingOnAir, .advertising])
    func couldNotGoOnAirUnlocksTheAmountWithTheReason(phase: HostBroadcast.Phase) {
        let state = makeState(phase: phase, session: session)

        assert(state, .couldNotGoOnAir(current, reason: "advertising refused")) {
            $0.phase = .ready
            $0.reason = "advertising refused"
            $0.attempt = nil
            $0.duration = nil
            $0.session = nil
        }
        assert(state, .couldNotGoOnAir(current, reason: "advertising refused"), delivers: .stopCountdown(current, retire: true))
    }

    @Test(arguments: ["off", "unauthorized"])
    func bluetoothLossOnAirUnlocksTheAmountWithTheReason(reason: String) {
        let state = makeState(phase: .advertising, secondsLeft: 40, session: session)

        assert(state, .bluetoothUnavailable(current, reason: reason)) {
            $0.phase = .ready
            $0.reason = reason
            $0.secondsLeft = nil
            $0.attempt = nil
            $0.duration = nil
            $0.session = nil
        }
        assert(state, .bluetoothUnavailable(current, reason: reason), delivers: .stopCountdown(current, retire: true))
    }

    @Test(arguments: [HostBroadcast.Phase.ready, .failed, .timedOut])
    func bluetoothLossWithNothingOnAirIsIgnored(phase: HostBroadcast.Phase) {
        let state = makeState(phase: phase)

        assert(state, .bluetoothUnavailable(current, reason: "off"))
        assert(state, .bluetoothUnavailable(current, reason: "off"), delivers: nil)
    }

    // MARK: - Countdown

    @Test(arguments: [
        HostBroadcast.Phase.advertising, .handshake(.stoppingAdvertising), .handshake(.derivingKey),
        .handshake(.sealingAmount), .handshake(.sendingAmount),
    ])
    func tickShowsTheSecondsLeft(phase: HostBroadcast.Phase) {
        let state = makeState(phase: phase, secondsLeft: 40)

        assert(state, .secondsLeft(current, 39)) { $0.secondsLeft = 39 }
        assert(state, .secondsLeft(current, 39), delivers: nil)
    }

    @Test(arguments: [
        HostBroadcast.Phase.advertising, .handshake(.stoppingAdvertising), .handshake(.derivingKey),
        .handshake(.sealingAmount),
    ])
    func expiryClearsTheAmountAndRetiresTheAttempt(phase: HostBroadcast.Phase) {
        let state = makeState(phase: phase, secondsLeft: 1, session: session)

        assert(state, .secondsLeft(current, 0)) {
            $0.phase = .timedOut
            $0.amount = ""
            $0.secondsLeft = nil
            $0.attempt = nil
            $0.duration = nil
            $0.session = nil
        }
        assert(state, .secondsLeft(current, 0), delivers: .stopCountdown(current, retire: true))
    }

    @Test(arguments: [HostBroadcast.Phase.goingOnAir, .ready, .failed])
    func tickOutsideTheCountdownIsIgnored(phase: HostBroadcast.Phase) {
        let state = makeState(phase: phase)

        assert(state, .secondsLeft(current, 0))
        assert(state, .secondsLeft(current, 0), delivers: nil)
    }

    @Test(arguments: [HostBroadcast.Phase.advertising, .handshake(.derivingKey)])
    func countdownStartedForTheLiveAttemptIsKept(phase: HostBroadcast.Phase) {
        let state = makeState(phase: phase, secondsLeft: 90)

        assert(state, .countdownStarted(current))
        assert(state, .countdownStarted(current), delivers: nil)
    }

    @Test(arguments: [HostBroadcast.Phase.ready, .goingOnAir, .failed, .timedOut])
    func countdownStartedAfterItsAttemptEndedIsStopped(phase: HostBroadcast.Phase) {
        let state = makeState(phase: phase)

        assert(state, .countdownStarted(current))
        assert(state, .countdownStarted(current), delivers: .stopCountdown(current, retire: false))
    }

    @Test func countdownStartedForAnEarlierAttemptIsStopped() {
        let state = makeState(phase: .advertising, secondsLeft: 90)

        assert(state, .countdownStarted(stale))
        assert(state, .countdownStarted(stale), delivers: .stopCountdown(stale, retire: false))
    }

    @Test func countdownStartedAfterCancelIsStopped() {
        let state = makeEndedState(phase: .ready)

        assert(state, .countdownStarted(current))
        assert(state, .countdownStarted(current), delivers: .stopCountdown(current, retire: false))
    }

    @Test func countdownStartedAfterHandoverIsStopped() {
        let link = HostBroadcast.SecureLink(attempt: current, session: session, link: client, amount: "124.50")
        let state = makeState(phase: .handedOver(link), session: session, link: client)

        assert(state, .countdownStarted(current))
        assert(state, .countdownStarted(current), delivers: .stopCountdown(current, retire: false))
    }

    @Test(arguments: livePhases)
    func countdownStartedForAnEarlierAttemptStopsOnlyThatAttempt(phase: HostBroadcast.Phase) {
        let state = makeState(phase: phase, secondsLeft: 40, session: session, link: client)

        assert(state, .countdownStarted(stale))
        assert(state, .countdownStarted(stale), delivers: .stopCountdown(stale, retire: false))
    }

    @Test(arguments: livePhases)
    func sessionOpenedForAnEarlierAttemptClosesOnlyThatSession(phase: HostBroadcast.Phase) {
        let state = makeState(phase: phase, secondsLeft: 40, session: session, link: client)

        assert(state, .sessionOpened(stale, session))
        assert(state, .sessionOpened(stale, session), delivers: .closeSession(stale))
    }

    // MARK: - Retiring an attempt

    @Test func stoppedCountdownToRetireRetiresTheAttempt() {
        let state = State(phase: .ready, amount: "124.50", nextAttempt: 2)

        assert(state, .countdownStopped(current, retire: true))
        assert(state, .countdownStopped(current, retire: true), delivers: .retire(current))
    }

    @Test func stoppedCountdownWithoutRetiringEndsThere() {
        let state = makeState(phase: .advertising)

        assert(state, .countdownStopped(stale, retire: false))
        assert(state, .countdownStopped(stale, retire: false), delivers: nil)
    }

    @Test func retiredAttemptClosesItsSession() {
        let state = State(phase: .ready, amount: "124.50", nextAttempt: 2)

        assert(state, .retired(current))
        assert(state, .retired(current), delivers: .closeSession(current))
    }

    @Test(arguments: [true, false])
    func sessionOpenedForAnEarlierAttemptIsClosed(hasLiveAttempt: Bool) {
        let state = hasLiveAttempt
            ? makeState(phase: .goingOnAir, preparation: .openingSession)
            : State(phase: .ready, amount: "124.50", nextAttempt: 2)

        assert(state, .sessionOpened(stale, session))
        assert(state, .sessionOpened(stale, session), delivers: .closeSession(stale))
    }

    // MARK: - Handshake

    @Test func firstClientKeyStopsAdvertisingAndKeepsTheCountdown() {
        let state = makeState(phase: .advertising, secondsLeft: 22, session: session)

        assert(state, .clientKey(current, client, key: [7, 8])) {
            $0.phase = .handshake(.stoppingAdvertising)
            $0.link = client
            $0.clientKey = [7, 8]
        }
        assert(state, .clientKey(current, client, key: [7, 8]), delivers: .stopAdvertising(current))
    }

    @Test(arguments: [
        HostBroadcast.HandshakeStep.stoppingAdvertising, .derivingKey, .sealingAmount, .sendingAmount,
    ])
    func secondClientKeyDuringTheHandshakeIsIgnored(step: HostBroadcast.HandshakeStep) {
        let state = makeState(phase: .handshake(step), secondsLeft: 22, session: session, link: client, clientKey: [7, 8])
        let other = HostBroadcast.Link(id: "other")

        assert(state, .clientKey(current, other, key: [1]))
        assert(state, .clientKey(current, other, key: [1]), delivers: nil)
    }

    @Test func stoppedAdvertisingDerivesTheKey() {
        let state = makeState(phase: .handshake(.stoppingAdvertising), secondsLeft: 22, session: session, link: client, clientKey: [7, 8])

        assert(state, .advertisingStopped(current)) { $0.phase = .handshake(.derivingKey) }
        assert(state, .advertisingStopped(current), delivers: .deriveKey(current, [7, 8]))
    }

    @Test(arguments: lockedAmounts)
    func derivedKeySealsTheSealedAmount(locked: SealedAmount) {
        let state = makeState(
            phase: .handshake(.derivingKey), amount: locked.amount, secondsLeft: 22, session: session, link: client,
            clientKey: [7, 8]
        )

        assert(state, .keyDerived(current)) { $0.phase = .handshake(.sealingAmount) }
        assert(state, .keyDerived(current), delivers: .sealAmount(current, locked.amount))
    }

    @Test(arguments: lockedAmounts)
    func sealedAmountIsSentToTheClient(locked: SealedAmount) {
        let state = makeState(
            phase: .handshake(.sealingAmount), amount: locked.amount, secondsLeft: 22, session: session, link: client,
            clientKey: [7, 8]
        )

        assert(state, .amountSealed(current, locked.sealed)) { $0.phase = .handshake(.sendingAmount) }
        assert(state, .amountSealed(current, locked.sealed), delivers: .sendAmount(current, client, locked.sealed))
    }

    @Test(arguments: lockedAmounts, [false, true])
    func sentAmountHandsOverTheSecureLinkAndStopsTheCountdown(locked: SealedAmount, expiryPending: Bool) {
        let state = makeState(
            phase: .handshake(.sendingAmount), amount: locked.amount, secondsLeft: expiryPending ? 0 : 12,
            session: session, link: client, clientKey: [7, 8], expiryPending: expiryPending
        )
        let secure = HostBroadcast.SecureLink(attempt: current, session: session, link: client, amount: locked.amount)

        assert(state, .amountSent(current)) {
            $0.phase = .handedOver(secure)
            $0.secondsLeft = nil
            $0.expiryPending = false
        }
        assert(state, .amountSent(current), delivers: .stopCountdown(current, retire: false))
    }

    @Test func expiryWhileSendingWaitsForTheSendsResult() {
        let state = makeState(phase: .handshake(.sendingAmount), secondsLeft: 1, session: session, link: client)

        assert(state, .secondsLeft(current, 0)) {
            $0.expiryPending = true
            $0.secondsLeft = 0
        }
        assert(state, .secondsLeft(current, 0), delivers: nil)
    }

    @Test func ticksAfterAPendingExpiryAreIgnored() {
        let state = makeState(
            phase: .handshake(.sendingAmount), secondsLeft: 0, session: session, link: client, expiryPending: true
        )

        assert(state, .secondsLeft(current, -1))
        assert(state, .secondsLeft(current, -1), delivers: nil)
    }

    @Test(arguments: [
        HostBroadcast.HandshakeStep.stoppingAdvertising, .derivingKey, .sealingAmount, .sendingAmount,
    ])
    func handshakeFailureOffersRetryAndANewAmount(step: HostBroadcast.HandshakeStep) {
        let state = makeState(phase: .handshake(step), secondsLeft: 12, session: session, link: client, clientKey: [7, 8])

        assert(state, .handshakeFailed(current, reason: "invalid client key")) {
            $0.phase = .failed
            $0.reason = "invalid client key"
            $0.secondsLeft = nil
            $0.attempt = nil
            $0.duration = nil
            $0.session = nil
            $0.link = nil
            $0.clientKey = nil
        }
        assert(state, .handshakeFailed(current, reason: "invalid client key"), delivers: .stopCountdown(current, retire: true))
    }

    @Test(arguments: [
        HostBroadcast.HandshakeStep.stoppingAdvertising, .derivingKey, .sealingAmount, .sendingAmount,
    ])
    func lostClientLinkDuringTheHandshakeFails(step: HostBroadcast.HandshakeStep) {
        let state = makeState(phase: .handshake(step), secondsLeft: 12, session: session, link: client, clientKey: [7, 8])

        assert(state, .linkLost(current, client)) {
            $0.phase = .failed
            $0.reason = "Client link lost"
            $0.secondsLeft = nil
            $0.attempt = nil
            $0.duration = nil
            $0.session = nil
            $0.link = nil
            $0.clientKey = nil
        }
        assert(state, .linkLost(current, client), delivers: .stopCountdown(current, retire: true))
    }

    @Test(arguments: [
        HostBroadcast.HandshakeStep.stoppingAdvertising, .derivingKey, .sealingAmount, .sendingAmount,
    ])
    func bluetoothLossDuringTheHandshakeFails(step: HostBroadcast.HandshakeStep) {
        let state = makeState(phase: .handshake(step), secondsLeft: 12, session: session, link: client, clientKey: [7, 8])

        assert(state, .bluetoothUnavailable(current, reason: "off")) {
            $0.phase = .failed
            $0.reason = "off"
            $0.secondsLeft = nil
            $0.attempt = nil
            $0.duration = nil
            $0.session = nil
            $0.link = nil
            $0.clientKey = nil
        }
        assert(state, .bluetoothUnavailable(current, reason: "off"), delivers: .stopCountdown(current, retire: true))
    }

    @Test(arguments: [
        HostBroadcast.HandshakeStep.stoppingAdvertising, .derivingKey, .sealingAmount, .sendingAmount,
    ])
    func unrelatedLinkLossLeavesTheHandshakeIntact(step: HostBroadcast.HandshakeStep) {
        let state = makeState(phase: .handshake(step), secondsLeft: 12, session: session, link: client, clientKey: [7, 8])
        let other = HostBroadcast.Link(id: "other")

        assert(state, .linkLost(current, other))
        assert(state, .linkLost(current, other), delivers: nil)
    }

    @Test(arguments: LossAfterExpiry.allCases)
    func lossAfterExpiryDuringTheSendTimesOut(loss: LossAfterExpiry) {
        let state = makeState(
            phase: .handshake(.sendingAmount), secondsLeft: 0, session: session, link: client, clientKey: [7, 8],
            expiryPending: true
        )

        assert(state, loss.event) {
            $0.phase = .timedOut
            $0.amount = ""
            $0.secondsLeft = nil
            $0.attempt = nil
            $0.duration = nil
            $0.session = nil
            $0.link = nil
            $0.clientKey = nil
            $0.expiryPending = false
        }
        assert(state, loss.event, delivers: .stopCountdown(current, retire: true))
    }

    @Test(arguments: [
        HostBroadcast.HandshakeStep.stoppingAdvertising, .derivingKey, .sealingAmount, .sendingAmount,
    ])
    func handshakeOffersNoCancelRetryOrNewAmount(step: HostBroadcast.HandshakeStep) {
        let state = makeState(phase: .handshake(step), secondsLeft: 12, session: session, link: client, clientKey: [7, 8])

        #expect(!state.canCancel && !state.canRetry && !state.canChooseNewAmount)
    }

    @Test(arguments: [
        HostBroadcast.HandshakeStep.stoppingAdvertising, .derivingKey, .sealingAmount, .sendingAmount,
    ], [Event.cancel, .retry, .newAmount, .lock(amount: "1.00")])
    func handshakeRejectsCancelRetryNewAmountAndLock(step: HostBroadcast.HandshakeStep, event: HostBroadcast.Event) {
        let state = makeState(phase: .handshake(step), secondsLeft: 12, session: session, link: client, clientKey: [7, 8])

        assert(state, event)
        assert(state, event, delivers: nil)
    }

    @Test(arguments: HandshakeOutOfTurn.all)
    func handshakeResultsOutOfTurnAreIgnored(late: HandshakeOutOfTurn) {
        let state = makeState(phase: late.phase, secondsLeft: 12, session: session, link: client, clientKey: [7, 8])

        assert(state, late.event)
        assert(state, late.event, delivers: nil)
    }

    @Test(arguments: [HostBroadcast.Phase.timedOut, .failed, .ready], [
        Event.advertisingStopped(current), .keyDerived(current), .amountSealed(current, .init(bytes: [1])),
        .amountSent(current), .handshakeFailed(current, reason: "late"), .linkLost(current, client),
    ])
    func handshakeResultsAfterTheAttemptEndedAreIgnored(phase: HostBroadcast.Phase, event: HostBroadcast.Event) {
        let state = State(phase: phase, amount: phase == .timedOut ? "" : "124.50", nextAttempt: 2)

        assert(state, event)
        assert(state, event, delivers: nil)
    }

    // MARK: - Handed over

    @Test func transactionEndAfterHandoverAcceptsANewAmount() {
        let secure = HostBroadcast.SecureLink(attempt: current, session: session, link: client, amount: "124.50")
        let state = makeState(phase: .handedOver(secure), session: session, link: client, clientKey: [7, 8])

        assert(state, .transactionEnded(current)) {
            $0.phase = .ready
            $0.amount = ""
            $0.attempt = nil
            $0.duration = nil
            $0.session = nil
            $0.link = nil
            $0.clientKey = nil
        }
        assert(state, .transactionEnded(current), delivers: nil)
    }

    @Test(arguments: [
        Event.transactionEnded(stale), .lock(amount: "1.00"), .cancel, .retry, .newAmount,
        .secondsLeft(current, 0), .linkLost(current, client), .bluetoothUnavailable(current, reason: "off"),
        .onAir(current), .couldNotGoOnAir(current, reason: "late"), .clientKey(current, client, key: [1]),
    ])
    func handedOverWaitsForItsOwnTransactionEnd(event: HostBroadcast.Event) {
        let secure = HostBroadcast.SecureLink(attempt: current, session: session, link: client, amount: "124.50")
        let state = makeState(phase: .handedOver(secure), session: session, link: client, clientKey: [7, 8])

        assert(state, event)
        assert(state, event, delivers: nil)
    }

    @Test(arguments: [HostBroadcast.Phase.ready, .advertising, .failed])
    func transactionEndBeforeHandoverIsIgnored(phase: HostBroadcast.Phase) {
        let state = makeState(phase: phase)

        assert(state, .transactionEnded(current))
        assert(state, .transactionEnded(current), delivers: nil)
    }

    // MARK: - Failed, retry and a new amount

    @Test func retryStartsAFreshAttemptWithTheSameAmount() {
        let state = State(phase: .failed, amount: "124.50", reason: "Client link lost", nextAttempt: 2)
        let next = HostBroadcast.Attempt(number: 3)

        assert(state, .retry) {
            $0.phase = .goingOnAir
            $0.reason = nil
            $0.attempt = next
            $0.nextAttempt = 3
            $0.preparation = .readingSetting
        }
        assert(state, .retry, delivers: .readCountdown(next))
    }

    @Test func newAmountAfterFailureClearsTheAmountAndReason() {
        let state = State(phase: .failed, amount: "124.50", reason: "Client link lost", nextAttempt: 2)

        assert(state, .newAmount) {
            $0.phase = .ready
            $0.amount = ""
            $0.reason = nil
        }
        assert(state, .newAmount, delivers: nil)
    }

    @Test(arguments: [HostBroadcast.Phase.ready, .goingOnAir, .advertising, .timedOut, .handshake(.sealingAmount)])
    func retryAndNewAmountOutsideFailureAreIgnored(phase: HostBroadcast.Phase) {
        let state = makeState(phase: phase)

        assert(state, .retry)
        assert(state, .retry, delivers: nil)
        assert(state, .newAmount)
        assert(state, .newAmount, delivers: nil)
    }

    // MARK: - Stale attempts

    @Test(arguments: StaleEvent.all)
    func eventsForAnEarlierAttemptCannotChangeTheLiveOne(stale: StaleEvent) {
        let state = makeState(
            phase: stale.phase, secondsLeft: 40, duration: 90, session: session, link: client, clientKey: [9],
            preparation: stale.preparation
        )

        assert(state, stale.event)
        assert(state, stale.event, delivers: nil)
    }
}

// MARK: - Cases

struct StepOutOfTurn: Sendable, CustomTestStringConvertible {
    let preparation: HostBroadcast.Preparation
    let event: HostBroadcast.Event
    var testDescription: String { "\(event) while \(preparation)" }

    static let all: [StepOutOfTurn] = [
        .init(preparation: .openingSession, event: .countdownRead(current, 99)),
        .init(preparation: .serving, event: .sessionOpened(current, session)),
        .init(preparation: .awaitingAir, event: .served(current)),
        .init(preparation: .serving, event: .onAir(current)),
    ]
}

struct StaleEvent: Sendable, CustomTestStringConvertible {
    let phase: HostBroadcast.Phase
    let preparation: HostBroadcast.Preparation?
    let event: HostBroadcast.Event
    var testDescription: String { "\(event) during \(phase)" }

    static let all: [StaleEvent] = {
        let preparing: [StaleEvent] = [
            .init(phase: .goingOnAir, preparation: .readingSetting, event: .countdownRead(stale, 99)),
            .init(phase: .goingOnAir, preparation: .serving, event: .served(stale)),
            .init(phase: .goingOnAir, preparation: .awaitingAir, event: .onAir(stale)),
            .init(phase: .goingOnAir, preparation: .awaitingAir, event: .couldNotGoOnAir(stale, reason: "old")),
        ]
        let advertising: [StaleEvent] = [
            .couldNotGoOnAir(stale, reason: "old"), .bluetoothUnavailable(stale, reason: "old"),
            .secondsLeft(stale, 0), .clientKey(stale, client, key: [9]),
        ].map { .init(phase: .advertising, preparation: nil, event: $0) }
        let handshake: [StaleEvent] = [
            (HostBroadcast.HandshakeStep.stoppingAdvertising, Event.advertisingStopped(stale)),
            (.derivingKey, .keyDerived(stale)),
            (.sealingAmount, .amountSealed(stale, .init(bytes: [1]))),
            (.sendingAmount, .amountSent(stale)),
        ].flatMap { step, event in
            [event, .bluetoothUnavailable(stale, reason: "old"), .secondsLeft(stale, 0),
             .handshakeFailed(stale, reason: "old"), .linkLost(stale, client)]
                .map { StaleEvent(phase: .handshake(step), preparation: nil, event: $0) }
        }
        return preparing + advertising + handshake
    }()
}

private let livePhases: [HostBroadcast.Phase] = [
    .advertising, .handshake(.stoppingAdvertising), .handshake(.derivingKey),
    .handshake(.sealingAmount), .handshake(.sendingAmount),
]

enum LossAfterExpiry: CaseIterable, Sendable {
    case sendFailed, linkLost, bluetooth

    var event: HostBroadcast.Event {
        switch self {
        case .sendFailed: .handshakeFailed(current, reason: "send failed")
        case .linkLost: .linkLost(current, client)
        case .bluetooth: .bluetoothUnavailable(current, reason: "off")
        }
    }
}

struct HandshakeOutOfTurn: Sendable, CustomTestStringConvertible {
    let phase: HostBroadcast.Phase
    let event: HostBroadcast.Event
    var testDescription: String { "\(event) during \(phase)" }

    static let all: [HandshakeOutOfTurn] = {
        let secure = HostBroadcast.SecureLink(attempt: current, session: session, link: client, amount: "124.50")
        return [
            .init(phase: .advertising, event: .advertisingStopped(current)),
            .init(phase: .handshake(.stoppingAdvertising), event: .keyDerived(current)),
            .init(phase: .handshake(.derivingKey), event: .amountSealed(current, .init(bytes: [1]))),
            .init(phase: .handshake(.sealingAmount), event: .amountSent(current)),
            .init(phase: .handedOver(secure), event: .amountSealed(current, .init(bytes: [1]))),
            .init(phase: .handedOver(secure), event: .amountSent(current)),
            .init(phase: .handedOver(secure), event: .handshakeFailed(current, reason: "late")),
            .init(phase: .advertising, event: .handshakeFailed(current, reason: "late")),
            .init(phase: .advertising, event: .linkLost(current, client)),
        ]
    }()
}

struct SealedAmount: Sendable, CustomTestStringConvertible {
    let amount: String
    let sealed: HostBroadcast.ProtectedAmount
    var testDescription: String { amount }
}

private let lockedAmounts: [SealedAmount] = [
    .init(amount: "124.50", sealed: .init(bytes: [91, 37, 206])),
    .init(amount: "99", sealed: .init(bytes: [6, 43, 128])),
    .init(amount: "0.01", sealed: .init(bytes: [8, 19, 71, 254])),
]

// MARK: - Helpers

/// A live attempt `current` locking "124.50"; pass what the scenario changes.
private func makeState(
    phase: HostBroadcast.Phase,
    amount: String = "124.50",
    secondsLeft: Int? = nil,
    duration: Int? = 90,
    session: HostBroadcast.Session? = nil,
    link: HostBroadcast.Link? = nil,
    clientKey: [UInt8]? = nil,
    preparation: HostBroadcast.Preparation? = nil,
    expiryPending: Bool = false
) -> State {
    State(
        phase: phase, amount: amount, secondsLeft: secondsLeft, attempt: current, nextAttempt: 2,
        duration: duration, session: session, link: link, clientKey: clientKey, preparation: preparation,
        expiryPending: expiryPending
    )
}

/// An attempt that has ended: no live attempt, duration or preparation left.
private func makeEndedState(phase: HostBroadcast.Phase) -> State {
    State(phase: phase, amount: "124.50", nextAttempt: 3)
}

private func assert(
    _ state: State,
    _ event: Event,
    sourceLocation: SourceLocation = #_sourceLocation,
    _ update: (inout State) -> Void = { _ in }
) {
    var expected = state
    update(&expected)
    #expect(HostBroadcast.reduce(state, event).0 == expected, sourceLocation: sourceLocation)
}

private func assert(
    _ state: State,
    _ event: Event,
    delivers effect: Effect?,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    #expect(HostBroadcast.reduce(state, event).1 == effect, sourceLocation: sourceLocation)
}
