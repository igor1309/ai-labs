import HostPayment
import Testing

private typealias State = HostPayment.State
private typealias Event = HostPayment.Event
private typealias Effect = HostPayment.Effect

private let sealedBytes: [UInt8] = [83, 17]

struct HostPaymentReducerTests {
    @Test(arguments: ["124.50", "0.01"])
    func startsAwaitingTheClientsDecisionWithNothingCharged(amount: String) {
        let state = State(amount: amount)

        #expect(state == makeState(amount: amount))
        #expect(state.nothingCharged)
        #expect(!state.canEnterNewAmount)
        #expect(!state.isOver)
    }

    // MARK: - Decision

    @Test(arguments: [[], [9, 4], [255, 0]] as [[UInt8]])
    func messageAwaitingDecisionIsOpened(bytes: [UInt8]) {
        let state = makeState()

        assert(state, .message(bytes))
        assert(state, .message(bytes), delivers: .open(bytes))
    }

    @Test(arguments: [HostPayment.Phase.choosingOutcome, .declined, .paid, .failed, .linkLost, .cancelled])
    func messageAfterTheDecisionIsIgnored(phase: HostPayment.Phase) {
        let state = makeState(phase: phase)

        assert(state, .message([7]))
        assert(state, .message([7]), delivers: nil)
    }

    @Test func declineSealsTheAcknowledgement() {
        let state = makeState()

        assert(state, .opened(.decline)) {
            $0.phase = .declined
            $0.pending = .sealing(.acknowledgement)
        }
        assert(state, .opened(.decline), delivers: .seal(.acknowledgement))
    }

    @Test func confirmationSealsTheAcknowledgementAndOffersTheOutcome() {
        let state = makeState()

        assert(state, .opened(.confirm)) {
            $0.phase = .choosingOutcome
            $0.pending = .sealing(.acknowledgement)
        }
        assert(state, .opened(.confirm), delivers: .seal(.acknowledgement))
    }

    @Test(arguments: [HostPayment.Decision.confirm, .decline])
    func secondDecisionIsIgnored(decision: HostPayment.Decision) {
        let state = makeState(phase: .choosingOutcome, pending: .sealing(.acknowledgement))

        assert(state, .opened(decision))
        assert(state, .opened(decision), delivers: nil)
    }

    /// A refused message leaves the flow waiting, so a later valid message still decides.
    @Test func refusedMessageChangesNothing() {
        let state = makeState()

        assert(state, .refused)
        assert(state, .refused, delivers: nil)
    }

    // MARK: - Sealing and sending

    @Test(arguments: [
        HostPayment.Message.acknowledgement, .result(.success), .result(.failure), .end,
    ])
    func sealedMessageIsSent(message: HostPayment.Message) {
        let state = makeState(phase: .paid, pending: .sealing(message))

        assert(state, .sealed(message, sealedBytes)) { $0.pending = .sending(message) }
        assert(state, .sealed(message, sealedBytes), delivers: .send(message, sealedBytes))
    }

    @Test(arguments: [nil, HostPayment.Pending.sealing(.end), .sending(.acknowledgement), .closing, .ending])
    func sealedMessageNotBeingSealedIsIgnored(pending: HostPayment.Pending?) {
        let state = makeState(phase: .choosingOutcome, pending: pending)

        assert(state, .sealed(.acknowledgement, sealedBytes))
        assert(state, .sealed(.acknowledgement, sealedBytes), delivers: nil)
    }

    @Test func acknowledgementSentLetsTheOperatorChoose() {
        let state = makeState(phase: .choosingOutcome, pending: .sending(.acknowledgement))

        assert(state, .sent(.acknowledgement)) { $0.pending = nil }
        assert(state, .sent(.acknowledgement), delivers: nil)
    }

    @Test func declineAcknowledgementSentClosesTheSession() {
        let state = makeState(phase: .declined, pending: .sending(.acknowledgement))

        assert(state, .sent(.acknowledgement)) { $0.pending = .closing }
        assert(state, .sent(.acknowledgement), delivers: .closeSession)
    }

    @Test(arguments: [(HostPayment.Outcome.success, HostPayment.Phase.paid), (.failure, .failed)])
    func acknowledgementSentSealsTheQueuedOutcome(outcome: HostPayment.Outcome, phase: HostPayment.Phase) {
        let state = makeState(
            phase: phase, nothingCharged: outcome != .success,
            pending: .sending(.acknowledgement), queuedOutcome: outcome
        )

        assert(state, .sent(.acknowledgement)) {
            $0.pending = .sealing(.result(outcome))
            $0.queuedOutcome = nil
        }
        assert(state, .sent(.acknowledgement), delivers: .seal(.result(outcome)))
    }

    @Test(arguments: [
        HostPayment.Message.acknowledgement, .result(.success), .end,
    ])
    func sentMessageNotBeingSentIsIgnored(message: HostPayment.Message) {
        let state = makeState(phase: .choosingOutcome, pending: .sealing(message))

        assert(state, .sent(message))
        assert(state, .sent(message), delivers: nil)
    }

    // MARK: - Outcome

    @Test(arguments: [
        (HostPayment.Outcome.success, HostPayment.Phase.paid, false), (.failure, .failed, true),
    ])
    func outcomeSealsTheResult(outcome: HostPayment.Outcome, phase: HostPayment.Phase, nothingCharged: Bool) {
        let state = makeState(phase: .choosingOutcome)

        assert(state, .outcome(outcome)) {
            $0.phase = phase
            $0.nothingCharged = nothingCharged
            $0.pending = .sealing(.result(outcome))
        }
        assert(state, .outcome(outcome), delivers: .seal(.result(outcome)))
    }

    /// A pick is accepted at once; its result follows the acknowledgement in radio order.
    @Test(arguments: [
        (HostPayment.Outcome.success, HostPayment.Phase.paid, false), (.failure, .failed, true),
    ], [HostPayment.Pending.sealing(.acknowledgement), .sending(.acknowledgement)])
    func outcomeBeforeTheAcknowledgementLeavesIsQueued(
        pick: (HostPayment.Outcome, HostPayment.Phase, Bool), pending: HostPayment.Pending
    ) {
        let (outcome, phase, nothingCharged) = pick
        let state = makeState(phase: .choosingOutcome, pending: pending)

        assert(state, .outcome(outcome)) {
            $0.phase = phase
            $0.nothingCharged = nothingCharged
            $0.queuedOutcome = outcome
        }
        assert(state, .outcome(outcome), delivers: nil)
    }

    @Test(arguments: [HostPayment.Phase.awaitingDecision, .declined, .paid, .failed, .linkLost, .cancelled])
    func outcomeOutsideChoosingIsIgnored(phase: HostPayment.Phase) {
        let state = makeState(phase: phase, pending: .sending(.acknowledgement), queuedOutcome: .success)

        assert(state, .outcome(.failure))
        assert(state, .outcome(.failure), delivers: nil)
    }

    @Test(arguments: [HostPayment.Outcome.success, .failure])
    func resultSentClosesTheSession(outcome: HostPayment.Outcome) {
        let state = makeState(phase: .paid, pending: .sending(.result(outcome)))

        assert(state, .sent(.result(outcome))) {
            $0.resultSent = true
            $0.pending = .closing
        }
        assert(state, .sent(.result(outcome)), delivers: .closeSession)
    }

    // MARK: - Failure

    @Test(arguments: [
        HostPayment.Message.acknowledgement, .result(.success), .result(.failure), .end,
    ], [false, true])
    func messageThatCannotBeSentLosesTheLink(message: HostPayment.Message, sealed: Bool) {
        let state = makeState(
            phase: .paid, nothingCharged: false,
            pending: sealed ? .sending(message) : .sealing(message), queuedOutcome: .success
        )

        assert(state, .sendFailed(message)) {
            $0.phase = .linkLost
            $0.nothingCharged = true
            $0.queuedOutcome = nil
            $0.pending = .closing
        }
        assert(state, .sendFailed(message), delivers: .closeSession)
    }

    @Test(arguments: [nil, HostPayment.Pending.sending(.end), .closing, .ending])
    func sendFailureForAnotherMessageIsIgnored(pending: HostPayment.Pending?) {
        let state = makeState(phase: .choosingOutcome, pending: pending)

        assert(state, .sendFailed(.acknowledgement))
        assert(state, .sendFailed(.acknowledgement), delivers: nil)
    }

    @Test(arguments: [
        (HostPayment.Phase.awaitingDecision, nil), (.choosingOutcome, nil),
        (.choosingOutcome, .sealing(.acknowledgement)), (.declined, .sending(.acknowledgement)),
        (.paid, .sealing(.result(.success))), (.paid, .sending(.result(.success))), (.cancelled, .sending(.end)),
    ] as [(HostPayment.Phase, HostPayment.Pending?)])
    func linkLostBeforeTheResultLeavesClosesTheSession(phase: HostPayment.Phase, pending: HostPayment.Pending?) {
        let state = makeState(phase: phase, nothingCharged: false, pending: pending, queuedOutcome: .success)

        assert(state, .linkLost) {
            $0.phase = .linkLost
            $0.nothingCharged = true
            $0.queuedOutcome = nil
            $0.pending = .closing
        }
        assert(state, .linkLost, delivers: .closeSession)
    }

    @Test(arguments: [
        makeState(phase: .paid, resultSent: true, nothingCharged: false, pending: .closing),
        makeState(phase: .paid, resultSent: true, nothingCharged: false, cleanupComplete: true),
        makeState(phase: .declined, cleanupComplete: true),
        makeState(phase: .linkLost, pending: .ending),
        makeState(phase: .linkLost, pending: .closing),
        makeState(phase: .cancelled, pending: .closing),
        makeState(phase: .cancelled, pending: .ending),
    ])
    func linkLostAfterTheResultOrDuringCleanupIsIgnored(state: HostPayment.State) {
        assert(state, .linkLost)
        assert(state, .linkLost, delivers: nil)
    }

    // MARK: - Cancel

    @Test func cancelAwaitingDecisionSealsTheEnd() {
        let state = makeState()

        assert(state, .cancel) {
            $0.phase = .cancelled
            $0.pending = .sealing(.end)
        }
        assert(state, .cancel, delivers: .seal(.end))
    }

    @Test(arguments: [HostPayment.Phase.choosingOutcome, .declined, .paid, .failed, .linkLost, .cancelled])
    func cancelAfterTheDecisionIsIgnored(phase: HostPayment.Phase) {
        let state = makeState(phase: phase)

        assert(state, .cancel)
        assert(state, .cancel, delivers: nil)
    }

    @Test func endSentClosesTheSession() {
        let state = makeState(phase: .cancelled, pending: .sending(.end))

        assert(state, .sent(.end)) { $0.pending = .closing }
        assert(state, .sent(.end), delivers: .closeSession)
    }

    // MARK: - Cleanup

    @Test func sessionClosedEndsTheLink() {
        let state = makeState(phase: .declined, pending: .closing)

        assert(state, .sessionClosed) { $0.pending = .ending }
        assert(state, .sessionClosed, delivers: .endLink)
    }

    @Test(arguments: [nil, HostPayment.Pending.sending(.acknowledgement), .ending])
    func sessionClosedWhenNotClosingIsIgnored(pending: HostPayment.Pending?) {
        let state = makeState(phase: .declined, pending: pending)

        assert(state, .sessionClosed)
        assert(state, .sessionClosed, delivers: nil)
    }

    @Test(arguments: [HostPayment.Phase.declined, .paid, .failed, .linkLost, .cancelled])
    func linkEndedCompletesTheCleanup(phase: HostPayment.Phase) {
        let state = makeState(phase: phase, pending: .ending)

        assert(state, .linkEnded) {
            $0.pending = nil
            $0.cleanupComplete = true
        }
        assert(state, .linkEnded, delivers: nil)
        #expect(!state.canEnterNewAmount)
        #expect(HostPayment.reduce(state, .linkEnded).0.canEnterNewAmount)
    }

    @Test(arguments: [nil, HostPayment.Pending.closing])
    func linkEndedWhenNotEndingIsIgnored(pending: HostPayment.Pending?) {
        let state = makeState(phase: .declined, pending: pending)

        assert(state, .linkEnded)
        assert(state, .linkEnded, delivers: nil)
    }

    // MARK: - New amount

    @Test(arguments: [HostPayment.Phase.declined, .paid, .failed, .linkLost, .cancelled])
    func newAmountAfterCleanupEndsTheFlow(phase: HostPayment.Phase) {
        let state = makeState(phase: phase, cleanupComplete: true)

        assert(state, .newAmount) { $0.phase = .over }
        assert(state, .newAmount, delivers: nil)
        #expect(HostPayment.reduce(state, .newAmount).0.isOver)
    }

    @Test(arguments: [
        makeState(), makeState(phase: .choosingOutcome),
        makeState(phase: .paid, pending: .sending(.result(.success))),
        makeState(phase: .declined, pending: .closing), makeState(phase: .linkLost, pending: .ending),
    ])
    func newAmountBeforeCleanupIsIgnored(state: HostPayment.State) {
        assert(state, .newAmount)
        assert(state, .newAmount, delivers: nil)
    }

    @Test(arguments: [
        HostPayment.Event.message([1]), .opened(.confirm), .opened(.decline), .refused, .outcome(.success), .outcome(.failure),
        .linkLost, .cancel, .newAmount, .sealed(.end, [1]), .sealed(.acknowledgement, [2]),
        .sealed(.result(.success), [3]), .sendFailed(.acknowledgement), .sendFailed(.end),
        .sendFailed(.result(.success)), .sent(.acknowledgement), .sent(.end), .sent(.result(.success)),
        .sessionClosed, .linkEnded,
    ])
    func everyEventAfterTheFlowIsOverIsIgnored(event: HostPayment.Event) {
        let state = makeState(phase: .over, cleanupComplete: true)

        assert(state, event)
        assert(state, event, delivers: nil)
    }

    @Test(arguments: [
        makeState(phase: .linkLost, cleanupComplete: true),
        makeState(phase: .linkLost, pending: .closing),
        makeState(phase: .linkLost, pending: .ending),
    ], lateCallbacks)
    func lateSendCallbacksAfterLinkLossAreIgnored(state: HostPayment.State, event: HostPayment.Event) {
        assert(state, event)
        assert(state, event, delivers: nil)
    }
}

private let lateCallbacks: [HostPayment.Event] = [
    HostPayment.Message.acknowledgement, .result(.success), .result(.failure), .end,
].flatMap { [.sealed($0, [1]), .sent($0), .sendFailed($0)] }

// MARK: - Helpers

private func makeState(
    amount: String = "124.50",
    phase: HostPayment.Phase = .awaitingDecision,
    resultSent: Bool = false,
    nothingCharged: Bool = true,
    cleanupComplete: Bool = false,
    pending: HostPayment.Pending? = nil,
    queuedOutcome: HostPayment.Outcome? = nil
) -> State {
    State(
        amount: amount, phase: phase, resultSent: resultSent, nothingCharged: nothingCharged,
        cleanupComplete: cleanupComplete, pending: pending, queuedOutcome: queuedOutcome
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
    #expect(HostPayment.reduce(state, event).0 == expected, sourceLocation: sourceLocation)
}

private func assert(
    _ state: State,
    _ event: Event,
    delivers effect: Effect?,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    #expect(HostPayment.reduce(state, event).1 == effect, sourceLocation: sourceLocation)
}
