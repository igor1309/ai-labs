import ClientConnect
import Testing

private typealias State = Connect.State
private typealias Event = Connect.Event
private typealias Effect = Connect.Effect

private let host = Connect.Host(id: "peripheral-7F3A", name: "MIZAN-7F3A")
private let hostSession = Connect.HostSession(publicKey: [1, 2, 3], id: [4, 5, 6])
private let sealed = Connect.SealedAmount(counter: 4, box: [8, 9])
private let otherSealed = Connect.SealedAmount(counter: 5, box: [10, 11])
private let amount = Connect.Amount(minorUnits: 12_450)

@MainActor
struct ClientConnectReducerTests {
    @Test(arguments: [Connect.Host(id: "till", name: "MIZAN-7F3A"), .init(id: "till", name: nil)])
    func startsIdleWithTheChosenHost(chosen: Connect.Host) {
        let state = State(host: chosen)

        #expect(state.host == chosen)
        #expect(state == makeState(host: chosen, phase: .idle))
    }

    // MARK: - Handshake

    @Test func startStartsTheDeadline() {
        let state = makeState(phase: .idle)

        assert(state, .start) {
            $0.phase = .connecting(.startingDeadline)
            $0.outstanding = [.startDeadline]
        }
        assert(state, .start, delivers: .startDeadline(seconds: 10))
    }

    @Test func deadlineStartedConnectsToTheChosenHost() {
        let state = makeState(phase: .connecting(.startingDeadline), outstanding: [.startDeadline])

        assert(state, .deadlineStarted) {
            $0.phase = .connecting(.connecting)
            $0.outstanding = [.connect]
        }
        assert(state, .deadlineStarted, delivers: .connect(host))
    }

    @Test func connectionDerivesTheKeyAndKeepsTheLargestWrite() {
        let state = makeState(phase: .connecting(.connecting))
        let event = Event.connectionResult(.success(.init(session: hostSession, largestWrite: 64)))

        assert(state, event) {
            $0.largestWrite = 64
            $0.phase = .connecting(.deriving)
            $0.outstanding = [.derive]
        }
        assert(state, event, delivers: .derive(hostSession))
    }

    @Test func connectionInitiatedOnlyCompletesItsWork() {
        let state = makeState(phase: .connecting(.deriving), outstanding: [.connect, .derive])

        assert(state, .connectionInitiated) { $0.outstanding = [.derive] }
        assert(state, .connectionInitiated, delivers: nil)
    }

    @Test(arguments: [34, 64])
    func derivedKeyThatFitsIsWritten(largestWrite: Int) {
        let key = Array(repeating: UInt8(7), count: 34)
        let state = makeState(phase: .connecting(.deriving), largestWrite: largestWrite, outstanding: [.derive])

        assert(state, .derivationResult(.success(key))) {
            $0.phase = .connecting(.writingKey)
            $0.outstanding = [.writeKey]
        }
        assert(state, .derivationResult(.success(key)), delivers: .writeKey(key))
    }

    @Test func keyLargerThanOneWriteFails() {
        let state = makeState(phase: .connecting(.deriving), largestWrite: 64, outstanding: [.derive])
        let key = Array(repeating: UInt8(7), count: 65)

        assert(state, .derivationResult(.success(key))) {
            $0.phase = .couldNotConnect(.keyTooLarge)
            $0.outstanding = []
            $0.cleanup = .stoppingDeadline
        }
        assert(state, .derivationResult(.success(key)), delivers: .stopDeadline)
    }

    @Test func linkTooSmallForASealedDecisionFails() {
        let state = makeState(phase: .connecting(.deriving), largestWrite: 33, outstanding: [.derive])
        let key = Array(repeating: UInt8(7), count: 33)

        assert(state, .derivationResult(.success(key))) {
            $0.phase = .couldNotConnect(.decisionTooLarge)
            $0.outstanding = []
            $0.cleanup = .stoppingDeadline
        }
        assert(state, .derivationResult(.success(key)), delivers: .stopDeadline)
    }

    @Test func keyWriteInitiatedOnlyCompletesItsWork() {
        let state = makeState(phase: .connecting(.writingKey), largestWrite: 64, outstanding: [.writeKey])

        assert(state, .keyWriteInitiated) { $0.outstanding = [] }
        assert(state, .keyWriteInitiated, delivers: nil)
    }

    @Test func acknowledgedKeyWaitsForTheAmount() {
        let state = makeState(phase: .connecting(.writingKey), largestWrite: 64)

        assert(state, .keyWriteResult(.success(()))) { $0.phase = .connecting(.waitingForAmount) }
        assert(state, .keyWriteResult(.success(())), delivers: nil)
    }

    @Test func amountBeforeTheKeyAcknowledgementIsKept() {
        let state = makeState(phase: .connecting(.writingKey), largestWrite: 64)

        assert(state, .amountReceived(sealed)) { $0.pendingAmount = sealed }
        assert(state, .amountReceived(sealed), delivers: nil)
    }

    @Test func secondAmountBeforeTheKeyAcknowledgementKeepsTheFirst() {
        let state = makeState(phase: .connecting(.writingKey), largestWrite: 64, pendingAmount: sealed)

        assert(state, .amountReceived(otherSealed))
        assert(state, .amountReceived(otherSealed), delivers: nil)
    }

    @Test func acknowledgedKeyOpensTheAmountThatCameFirst() {
        let state = makeState(phase: .connecting(.writingKey), largestWrite: 64, pendingAmount: sealed)

        assert(state, .keyWriteResult(.success(()))) {
            $0.pendingAmount = nil
            $0.phase = .connecting(.openingAmount)
            $0.outstanding = [.open]
        }
        assert(state, .keyWriteResult(.success(())), delivers: .open(sealed))
    }

    @Test func amountAfterTheKeyIsOpened() {
        let state = makeState(phase: .connecting(.waitingForAmount), largestWrite: 64)

        assert(state, .amountReceived(sealed)) {
            $0.phase = .connecting(.openingAmount)
            $0.outstanding = [.open]
        }
        assert(state, .amountReceived(sealed), delivers: .open(sealed))
    }

    @Test func openedAmountStopsTheDeadlineBeforeHandover() {
        let link = LinkStub(), session = SessionStub()
        let state = makeState(phase: .connecting(.openingAmount), largestWrite: 64, outstanding: [.open])
        let event = Event.amountOpened(.success(amount), link: link, session: session)

        assert(state, event) {
            $0.handover = .init(link: link, session: session, amount: amount)
            $0.phase = .connecting(.stoppingDeadline)
            $0.outstanding = []
        }
        assert(state, event, delivers: .stopDeadline)
    }

    @Test func stoppedDeadlineHandsOverTheSecureLinkWithItsAmount() {
        let handover = Connect.Handover(link: LinkStub(), session: SessionStub(), amount: amount)
        let state = makeState(phase: .connecting(.stoppingDeadline), largestWrite: 64, handover: handover)

        assert(state, .deadlineStopped) {
            $0.phase = .handedOver(handover)
            $0.handover = nil
        }
        assert(state, .deadlineStopped, delivers: nil)
    }

    @Test func deadlineExpiringAfterTheAmountOpenedDoesNotFail() {
        let handover = Connect.Handover(link: LinkStub(), session: SessionStub(), amount: amount)
        let state = makeState(phase: .connecting(.stoppingDeadline), largestWrite: 64, handover: handover)

        assert(state, .deadlineExpired)
        assert(state, .deadlineExpired, delivers: nil)
    }

    // MARK: - Failures

    @Test(arguments: Failing.allCases)
    func failedStepEndsInCouldNotConnectAndStartsCleanup(failing: Failing) {
        let state = makeState(
            phase: .connecting(failing.step), largestWrite: 64, pendingAmount: failing.pending,
            outstanding: failing.outstanding.union([.startDeadline])
        )

        assert(state, failing.event) {
            $0.phase = .couldNotConnect(failing.failure)
            $0.pendingAmount = nil
            $0.outstanding = [.startDeadline]
            $0.cleanup = .stoppingDeadline
        }
        assert(state, failing.event, delivers: .stopDeadline)
    }

    @Test(arguments: [
        Connect.Step.startingDeadline, .connecting, .deriving, .writingKey, .waitingForAmount, .openingAmount,
    ])
    func linkDropDuringHandshakeFails(step: Connect.Step) {
        let state = makeState(phase: .connecting(step), largestWrite: 64, pendingAmount: sealed)

        assert(state, .linkDropped) {
            $0.phase = .couldNotConnect(.linkDropped)
            $0.pendingAmount = nil
            $0.cleanup = .stoppingDeadline
        }
        assert(state, .linkDropped, delivers: .stopDeadline)
    }

    @Test(arguments: [
        Connect.Step.startingDeadline, .connecting, .deriving, .writingKey, .waitingForAmount, .openingAmount,
    ])
    func deadlineExpiringDuringHandshakeFails(step: Connect.Step) {
        let state = makeState(phase: .connecting(step), largestWrite: 64)

        assert(state, .deadlineExpired) {
            $0.phase = .couldNotConnect(.deadlineExceeded)
            $0.cleanup = .stoppingDeadline
        }
        assert(state, .deadlineExpired, delivers: .stopDeadline)
    }

    // MARK: - Cancel and retry

    @Test(arguments: [
        Connect.Step.startingDeadline, .connecting, .deriving, .writingKey, .waitingForAmount, .openingAmount,
        .stoppingDeadline,
    ])
    func payerCancelsDuringHandshake(step: Connect.Step) {
        let handover = Connect.Handover(link: LinkStub(), session: SessionStub(), amount: amount)
        let state = makeState(
            phase: .connecting(step), largestWrite: 64, pendingAmount: sealed, handover: handover,
            outstanding: [.open]
        )

        assert(state, .cancel) {
            $0.phase = .ending
            $0.pendingAmount = nil
            $0.handover = nil
            $0.cleanup = .stoppingDeadline
        }
        assert(state, .cancel, delivers: .stopDeadline)
    }

    @Test(arguments: [Connect.Cleanup.stoppingDeadline, .waitingForWork, .droppingLink, .closingSession])
    func retryBeforeCleanupEndsWaitsForIt(cleanup: Connect.Cleanup) {
        let outstanding: Set<Connect.Work> = cleanup == .waitingForWork ? [.open] : []
        let state = makeState(phase: .couldNotConnect(.linkDropped), cleanup: cleanup, outstanding: outstanding)

        assert(state, .retry) { $0.phase = .ending }
        assert(state, .retry, delivers: nil)
    }

    @Test func retryAfterCleanupEndsTheTransaction() {
        let state = makeState(phase: .couldNotConnect(.linkDropped), cleanup: .done)

        assert(state, .retry) { $0.phase = .over }
        assert(state, .retry, delivers: nil)
    }

    // MARK: - Cleanup

    @Test func stoppedDeadlineWithNoWorkLeftDropsTheLink() {
        let state = makeState(phase: .ending, cleanup: .stoppingDeadline)

        assert(state, .deadlineStopped) { $0.cleanup = .droppingLink }
        assert(state, .deadlineStopped, delivers: .dropLink)
    }

    @Test func stoppedDeadlineWithWorkLeftWaitsForIt() {
        let state = makeState(phase: .ending, cleanup: .stoppingDeadline, outstanding: [.open])

        assert(state, .deadlineStopped) { $0.cleanup = .waitingForWork }
        assert(state, .deadlineStopped, delivers: nil)
    }

    @Test(arguments: WorkAnswer.allCases)
    func lastAnsweredWorkStopsTheDeadlineAgain(answer: WorkAnswer) {
        let state = makeState(phase: .ending, cleanup: .waitingForWork, outstanding: [answer.work])

        assert(state, answer.event) {
            $0.outstanding = []
            $0.cleanup = .stoppingDeadline
        }
        assert(state, answer.event, delivers: .stopDeadline)
    }

    @Test func answeredWorkWithMoreLeftKeepsWaiting() {
        let state = makeState(phase: .ending, cleanup: .waitingForWork, outstanding: [.connect, .writeKey])

        assert(state, .connectionInitiated) { $0.outstanding = [.writeKey] }
        assert(state, .connectionInitiated, delivers: nil)
    }

    @Test func droppedLinkClosesTheSession() {
        let state = makeState(phase: .ending, cleanup: .droppingLink)

        assert(state, .linkDroppedForCleanup) { $0.cleanup = .closingSession }
        assert(state, .linkDroppedForCleanup, delivers: .closeSession)
    }

    @Test func closedSessionEndsTheCancelledTransaction() {
        let state = makeState(phase: .ending, cleanup: .closingSession)

        assert(state, .sessionClosed) {
            $0.cleanup = .done
            $0.phase = .over
        }
        assert(state, .sessionClosed, delivers: nil)
    }

    @Test func closedSessionKeepsTheFailureShownForRetry() {
        let state = makeState(phase: .couldNotConnect(.linkDropped), cleanup: .closingSession)

        assert(state, .sessionClosed) { $0.cleanup = .done }
        assert(state, .sessionClosed, delivers: nil)
    }

    /// After a failure (expiry, link drop), a cancel or a retry, a late amount result of either kind only
    /// completes its work: the phase stays and no cleanup step repeats.
    @Test(arguments: LateEnding.all, [true, false])
    func lateAmountResultAfterTheTransactionEndedOnlyCompletesItsWork(ending: LateEnding, opened: Bool) {
        let state = makeState(phase: ending.phase, cleanup: ending.cleanup, outstanding: [.open, .writeKey])
        let result: Result<Connect.Amount, Connect.Failure> = opened ? .success(.init(minorUnits: 999)) : .failure(.unreadableAmount)
        let event = Event.amountOpened(result, link: LinkStub(), session: SessionStub())

        assert(state, event) { $0.outstanding = [.writeKey] }
        assert(state, event, delivers: nil)
    }

    // MARK: - Ignored events

    @Test(arguments: IgnoredCase.all)
    func eventsOutsideTheirStepAreIgnored(ignored: IgnoredCase) {
        assert(ignored.state, ignored.event)
        assert(ignored.state, ignored.event, delivers: nil)
    }
}

// MARK: - Cases

struct LateEnding: Sendable, CustomTestStringConvertible {
    let phase: ClientConnect.Phase
    let cleanup: ClientConnect.Cleanup

    var testDescription: String { "\(phase) at \(cleanup)" }

    static let all: [LateEnding] = {
        let cleanups: [ClientConnect.Cleanup] = [.stoppingDeadline, .waitingForWork, .droppingLink, .closingSession, .done]
        let endings: [ClientConnect.Phase] = [.couldNotConnect(.deadlineExceeded), .couldNotConnect(.linkDropped), .ending]
        return endings.flatMap { phase in cleanups.map { LateEnding(phase: phase, cleanup: $0) } }
            + [LateEnding(phase: .over, cleanup: .done)]
    }()
}

enum Failing: CaseIterable, Sendable, CustomTestStringConvertible {
    case connection, derivation, keyWrite, opening

    var step: ClientConnect.Step {
        switch self {
        case .connection: .connecting
        case .derivation: .deriving
        case .keyWrite: .writingKey
        case .opening: .openingAmount
        }
    }

    var failure: ClientConnect.Failure {
        switch self {
        case .connection: .connection("could not set up")
        case .derivation: .sessionDisagreement
        case .keyWrite: .keyRefused("refused")
        case .opening: .unreadableAmount
        }
    }

    var pending: ClientConnect.SealedAmount? { self == .keyWrite ? sealed : nil }

    /// The work this failure answers; a failed result completes its work like a successful one.
    var outstanding: Set<ClientConnect.Work> {
        switch self {
        case .connection, .keyWrite: []
        case .derivation: [.derive]
        case .opening: [.open]
        }
    }

    @MainActor var event: ClientConnect.Event {
        switch self {
        case .connection: .connectionResult(.failure(failure))
        case .derivation: .derivationResult(.failure(failure))
        case .keyWrite: .keyWriteResult(.failure(failure))
        case .opening: .amountOpened(.failure(failure), link: LinkStub(), session: SessionStub())
        }
    }

    var testDescription: String { "\(self)" }
}

enum WorkAnswer: CaseIterable, Sendable {
    case deadlineStarted, connectionInitiated, derivation, derivationFailed, keyWriteInitiated, opening, openingFailed

    var work: ClientConnect.Work {
        switch self {
        case .deadlineStarted: .startDeadline
        case .connectionInitiated: .connect
        case .derivation, .derivationFailed: .derive
        case .keyWriteInitiated: .writeKey
        case .opening, .openingFailed: .open
        }
    }

    @MainActor var event: ClientConnect.Event {
        switch self {
        case .deadlineStarted: .deadlineStarted
        case .connectionInitiated: .connectionInitiated
        case .derivation: .derivationResult(.success([7]))
        case .derivationFailed: .derivationResult(.failure(.sessionDisagreement))
        case .keyWriteInitiated: .keyWriteInitiated
        case .opening: .amountOpened(.success(amount), link: LinkStub(), session: SessionStub())
        case .openingFailed: .amountOpened(.failure(.unreadableAmount), link: LinkStub(), session: SessionStub())
        }
    }
}

struct IgnoredCase: Sendable, CustomTestStringConvertible {
    let name: String
    let phase: ClientConnect.Phase
    let cleanup: ClientConnect.Cleanup
    let makeEvent: @MainActor @Sendable () -> ClientConnect.Event

    var testDescription: String { name }
    @MainActor fileprivate var state: State { makeState(phase: phase, largestWrite: 64, cleanup: cleanup) }
    @MainActor var event: ClientConnect.Event { makeEvent() }

    static let all: [IgnoredCase] = {
        let failed = ClientConnect.Phase.couldNotConnect(.linkDropped)
        return [
            .init(name: "start while connecting", phase: .connecting(.connecting), cleanup: .none) { .start },
            .init(name: "retry while connecting", phase: .connecting(.deriving), cleanup: .none) { .retry },
            .init(name: "cancel while idle", phase: .idle, cleanup: .none) { .cancel },
            .init(name: "link drop while idle", phase: .idle, cleanup: .none) { .linkDropped },
            .init(name: "connection result before connecting", phase: .connecting(.startingDeadline), cleanup: .none) {
                .connectionResult(.success(.init(session: hostSession, largestWrite: 64)))
            },
            .init(name: "amount while deriving", phase: .connecting(.deriving), cleanup: .none) {
                .amountReceived(sealed)
            },
            .init(name: "key write result while waiting for amount", phase: .connecting(.waitingForAmount), cleanup: .none) {
                .keyWriteResult(.success(()))
            },
            .init(name: "deadline stopped while connecting", phase: .connecting(.connecting), cleanup: .none) {
                .deadlineStopped
            },
            .init(name: "cancel after failure", phase: failed, cleanup: .stoppingDeadline) { .cancel },
            .init(name: "link drop after failure", phase: failed, cleanup: .droppingLink) { .linkDropped },
            .init(name: "expiry after failure", phase: failed, cleanup: .closingSession) { .deadlineExpired },
            .init(name: "link drop while ending", phase: .ending, cleanup: .droppingLink) { .linkDropped },
            .init(name: "expiry while ending", phase: .ending, cleanup: .stoppingDeadline) { .deadlineExpired },
            .init(name: "deadline stopped twice", phase: .ending, cleanup: .droppingLink) { .deadlineStopped },
            .init(name: "link dropped for cleanup twice", phase: .ending, cleanup: .closingSession) {
                .linkDroppedForCleanup
            },
            .init(name: "session closed twice", phase: .over, cleanup: .done) { .sessionClosed },
            .init(name: "start when over", phase: .over, cleanup: .done) { .start },
            .init(name: "retry when over", phase: .over, cleanup: .done) { .retry },
            .init(name: "amount when over", phase: .over, cleanup: .done) { .amountReceived(otherSealed) },
            .init(
                name: "amount after handover",
                phase: .handedOver(.init(link: LinkStub(), session: SessionStub(), amount: amount)), cleanup: .none
            ) { .amountReceived(otherSealed) },
            .init(
                name: "cancel after handover",
                phase: .handedOver(.init(link: LinkStub(), session: SessionStub(), amount: amount)), cleanup: .none
            ) { .cancel },
            .init(
                name: "link drop after handover",
                phase: .handedOver(.init(link: LinkStub(), session: SessionStub(), amount: amount)), cleanup: .none
            ) { .linkDropped },
        ]
    }()
}

// MARK: - Helpers

@MainActor
private func makeState(
    host: Connect.Host = host,
    phase: Connect.Phase = .connecting(.connecting),
    largestWrite: Int = 0,
    pendingAmount: Connect.SealedAmount? = nil,
    handover: Connect.Handover? = nil,
    cleanup: Connect.Cleanup = .none,
    outstanding: Set<Connect.Work> = []
) -> State {
    State(
        host: host, phase: phase, largestWrite: largestWrite, pendingAmount: pendingAmount,
        handover: handover, cleanup: cleanup, outstanding: outstanding
    )
}

private func assert(
    _ state: State,
    _ event: Event,
    sourceLocation: SourceLocation = #_sourceLocation,
    _ update: (inout State) -> Void = { _ in }
) {
    var expected = state
    update(&expected)
    #expect(Connect.reduce(state, event).0 == expected, sourceLocation: sourceLocation)
}

private func assert(
    _ state: State,
    _ event: Event,
    delivers effect: Effect?,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    #expect(Connect.reduce(state, event).1 == effect, sourceLocation: sourceLocation)
}

@MainActor private final class LinkStub: Connect.Link {
    func connect(to host: Connect.Host) {}
    func writeKey(_ key: [UInt8]) {}
    func drop() {}
}

@MainActor private final class SessionStub: Connect.Session {
    func derive(with host: Connect.HostSession) -> Result<[UInt8], Connect.Failure> { .success([]) }
    func open(_ amount: Connect.SealedAmount) -> Result<Connect.Amount, Connect.Failure> { .success(.init(minorUnits: 1)) }
    func close() {}
}
