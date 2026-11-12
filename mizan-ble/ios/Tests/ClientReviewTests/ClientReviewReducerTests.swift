import ClientReview
import Testing

private typealias State = ClientReview.State
private typealias Event = ClientReview.Event
private typealias Effect = ClientReview.Effect

private let host = ClientReview.Host(id: "till", name: "MIZAN-7F3A")
private let sealed: [UInt8] = [0xC0, 0x01]

struct ClientReviewReducerTests {
    @Test func startsReviewingTheHandedOverAmount() {
        let state = State(host: host, amount: 12_450)

        #expect(state == makeState(phase: .reviewing))
        #expect(state.canDecide)
        #expect(state.charge == nil)
        #expect(!state.canFinish)
        #expect(!state.isDone)
    }

    // MARK: - Deciding

    @Test(arguments: [ClientReview.Decision.confirm, .decline])
    func decisionIsSealed(decision: ClientReview.Decision) {
        let state = makeState()

        assert(state, .decide(decision)) { $0.phase = .sending(decision) }
        assert(state, .decide(decision), delivers: .seal(decision))
    }

    @Test(arguments: [ClientReview.Decision.confirm, .decline])
    func decisionOnItsWayCannotBeChanged(decision: ClientReview.Decision) {
        let state = makeState(phase: .sending(.confirm))

        assert(state, .decide(decision))
        assert(state, .decide(decision), delivers: nil)
    }

    @Test func decisionAfterAHeldLinkLossIsIgnored() {
        let state = makeState(pendingMessages: 1, deferredLinkLoss: .notCharged)

        #expect(!state.canDecide)
        assert(state, .decide(.confirm))
        assert(state, .decide(.confirm), delivers: nil)
    }

    @Test(arguments: [ClientReview.Decision.confirm, .decline])
    func sealedDecisionIsWritten(decision: ClientReview.Decision) {
        let state = makeState(phase: .sending(decision))

        assert(state, .sealed(decision, sealed)) { $0.writeStarted = true }
        assert(state, .sealed(decision, sealed), delivers: .write(decision, sealed))
    }

    @Test func decisionIsWrittenOnlyOnce() {
        let state = makeState(phase: .sending(.confirm), writeStarted: true)

        assert(state, .sealed(.confirm, sealed))
        assert(state, .sealed(.confirm, sealed), delivers: nil)
    }

    @Test func sealedOtherDecisionIsIgnored() {
        let state = makeState(phase: .sending(.confirm))

        assert(state, .sealed(.decline, sealed))
        assert(state, .sealed(.decline, sealed), delivers: nil)
    }

    @Test(arguments: [ClientReview.Decision.confirm, .decline])
    func acceptedWriteStaysOnItsWayToTheAcknowledgement(decision: ClientReview.Decision) {
        let state = makeState(phase: .sending(decision), writeStarted: true)

        assert(state, .written(decision, .accepted))
        assert(state, .written(decision, .accepted), delivers: nil)
    }

    @Test(arguments: [ClientReview.Decision.confirm, .decline])
    func refusedWriteIsNotCharged(decision: ClientReview.Decision) {
        let state = makeState(phase: .sending(decision), writeStarted: true)

        assert(state, .written(decision, .refused)) {
            $0.phase = .ended(.linkLost(.notCharged))
            $0.cleanup = .closing
        }
        assert(state, .written(decision, .refused), delivers: .closeSession)
    }

    @Test func refusedWriteWithAMessageStillOpeningWaitsForIt() {
        let state = makeState(phase: .sending(.confirm), writeStarted: true, pendingMessages: 1)

        assert(state, .written(.confirm, .refused)) { $0.deferredLinkLoss = .notCharged }
        assert(state, .written(.confirm, .refused), delivers: nil)
    }

    @Test(arguments: [ClientReview.WriteResult.accepted, .refused])
    func writeResultBeforeTheWriteIsIgnored(result: ClientReview.WriteResult) {
        let state = makeState(phase: .sending(.confirm))

        assert(state, .written(.confirm, result))
        assert(state, .written(.confirm, result), delivers: nil)
    }

    // MARK: - Messages

    @Test(arguments: [ClientReview.Phase.reviewing, .sending(.confirm), .sending(.decline)])
    func messageIsOpened(phase: ClientReview.Phase) {
        let state = makeState(phase: phase, writeStarted: phase != .reviewing, pendingMessages: 1)

        assert(state, .message([0x02])) { $0.pendingMessages = 2 }
        assert(state, .message([0x02]), delivers: .open([0x02]))
    }

    @Test func messageAfterAHeldLinkLossIsIgnored() {
        let state = makeState(pendingMessages: 1, deferredLinkLoss: .notCharged)

        assert(state, .message([0x02]))
        assert(state, .message([0x02]), delivers: nil)
    }

    @Test func openedWithNothingPendingIsIgnored() {
        let state = makeState(phase: .sending(.confirm), writeStarted: true)

        assert(state, .opened(.decisionAcknowledged))
        assert(state, .opened(.decisionAcknowledged), delivers: nil)
    }

    @Test(arguments: [ClientReview.Phase.reviewing, .sending(.confirm), .sending(.decline)])
    func hostCancels(phase: ClientReview.Phase) {
        let state = makeState(phase: phase, writeStarted: phase != .reviewing, pendingMessages: 1)

        assert(state, .opened(.end)) {
            $0.pendingMessages = 0
            $0.phase = .ended(.hostCancelled)
            $0.cleanup = .closing
        }
        assert(state, .opened(.end), delivers: .closeSession)
    }

    @Test func hostCancelsWithAnotherMessageStillOpening() {
        let state = makeState(pendingMessages: 2)

        assert(state, .opened(.end)) {
            $0.pendingMessages = 1
            $0.phase = .ended(.hostCancelled)
        }
        assert(state, .opened(.end), delivers: nil)
    }

    @Test func acknowledgedConfirmHandsOver() {
        let state = makeState(phase: .sending(.confirm), writeStarted: true, pendingMessages: 1)

        assert(state, .opened(.decisionAcknowledged)) {
            $0.pendingMessages = 0
            $0.acknowledgedDecision = .confirm
            $0.phase = .handedOver
        }
        assert(state, .opened(.decisionAcknowledged), delivers: nil)
    }

    /// A held link loss does not change a declined review: nothing was charged either way.
    @Test(arguments: [nil, ClientReview.Charge.notCharged, .unknown])
    func acknowledgedDeclineEndsDeclined(heldLoss: ClientReview.Charge?) {
        let state = makeState(
            phase: .sending(.decline), writeStarted: true, pendingMessages: 1, deferredLinkLoss: heldLoss
        )

        assert(state, .opened(.decisionAcknowledged)) {
            $0.pendingMessages = 0
            $0.acknowledgedDecision = .decline
            $0.phase = .ended(.declined)
            $0.cleanup = .closing
        }
        assert(state, .opened(.decisionAcknowledged), delivers: .closeSession)
    }

    @Test func acknowledgedConfirmAfterALinkLossCannotBeHandedOver() {
        let state = makeState(
            phase: .sending(.confirm), writeStarted: true, pendingMessages: 1, deferredLinkLoss: .unknown
        )

        assert(state, .opened(.decisionAcknowledged)) {
            $0.pendingMessages = 0
            $0.acknowledgedDecision = .confirm
            $0.phase = .ended(.linkLost(.unknown))
            $0.cleanup = .closing
        }
        assert(state, .opened(.decisionAcknowledged), delivers: .closeSession)
    }

    @Test(arguments: [ClientReview.Phase.reviewing, .sending(.confirm)])
    func acknowledgementBeforeTheWriteIsIgnored(phase: ClientReview.Phase) {
        let state = makeState(phase: phase, pendingMessages: 1)

        assert(state, .opened(.decisionAcknowledged)) { $0.pendingMessages = 0 }
        assert(state, .opened(.decisionAcknowledged), delivers: nil)
    }

    @Test(arguments: [ClientReview.Message.unrelated, nil])
    func unrelatedOrRefusedMessageChangesNothing(message: ClientReview.Message?) {
        let state = makeState(phase: .sending(.confirm), writeStarted: true, pendingMessages: 1)

        assert(state, .opened(message)) { $0.pendingMessages = 0 }
        assert(state, .opened(message), delivers: nil)
    }

    @Test(arguments: [ClientReview.Message.unrelated, nil], [ClientReview.Charge.notCharged, .unknown])
    func lastUninterpretableMessageReleasesTheHeldLinkLoss(message: ClientReview.Message?, charge: ClientReview.Charge) {
        let state = makeState(
            phase: .sending(.confirm), writeStarted: true, pendingMessages: 1, deferredLinkLoss: charge
        )

        assert(state, .opened(message)) {
            $0.pendingMessages = 0
            $0.phase = .ended(.linkLost(charge))
            $0.cleanup = .closing
        }
        assert(state, .opened(message), delivers: .closeSession)
    }

    @Test(arguments: [ClientReview.Message.unrelated, nil])
    func heldLinkLossWaitsForEveryUninterpretableMessage(message: ClientReview.Message?) {
        let state = makeState(pendingMessages: 2, deferredLinkLoss: .notCharged)

        assert(state, .opened(message)) { $0.pendingMessages = 1 }
        assert(state, .opened(message), delivers: nil)
    }

    @Test func cancellationReceivedBeforeLinkLossSurvivesIt() {
        let state = makeState(pendingMessages: 1, deferredLinkLoss: .notCharged)

        assert(state, .opened(.end)) {
            $0.pendingMessages = 0
            $0.phase = .ended(.hostCancelled)
            $0.cleanup = .closing
        }
        assert(state, .opened(.end), delivers: .closeSession)
    }

    @Test func lastMessageOpenedAfterTheEndStartsCleanup() {
        let state = makeState(phase: .ended(.hostCancelled), pendingMessages: 1)

        assert(state, .opened(.decisionAcknowledged)) {
            $0.pendingMessages = 0
            $0.cleanup = .closing
        }
        assert(state, .opened(.decisionAcknowledged), delivers: .closeSession)
    }

    @Test func messageOpenedAfterTheEndWithMoreLeftWaits() {
        let state = makeState(phase: .ended(.hostCancelled), pendingMessages: 2)

        assert(state, .opened(nil)) { $0.pendingMessages = 1 }
        assert(state, .opened(nil), delivers: nil)
    }

    @Test(arguments: [ClientReview.Phase.handedOver, .over])
    func messageOpenedAfterHandoverOnlyCountsDown(phase: ClientReview.Phase) {
        let state = makeState(phase: phase, acknowledgedDecision: .confirm, writeStarted: true, pendingMessages: 1)

        assert(state, .opened(.end)) { $0.pendingMessages = 0 }
        assert(state, .opened(.end), delivers: nil)
    }

    // MARK: - Link loss

    @Test(arguments: [
        (ClientReview.Phase.reviewing, false, ClientReview.Charge.notCharged),
        (.sending(.confirm), false, .notCharged),
        (.sending(.confirm), true, .unknown),
        (.sending(.decline), true, .notCharged),
    ])
    func linkLossEndsTheReview(phase: ClientReview.Phase, writeStarted: Bool, charge: ClientReview.Charge) {
        let state = makeState(phase: phase, writeStarted: writeStarted)

        assert(state, .linkLost) {
            $0.phase = .ended(.linkLost(charge))
            $0.cleanup = .closing
        }
        assert(state, .linkLost, delivers: .closeSession)
    }

    @Test(arguments: [(false, ClientReview.Charge.notCharged), (true, .unknown)])
    func linkLossWithAMessageStillOpeningIsHeld(writeStarted: Bool, charge: ClientReview.Charge) {
        let state = makeState(phase: .sending(.confirm), writeStarted: writeStarted, pendingMessages: 1)

        assert(state, .linkLost) { $0.deferredLinkLoss = charge }
        assert(state, .linkLost, delivers: nil)
    }

    // MARK: - Cleanup and done

    @Test func closedSessionDropsTheLink() {
        let state = makeState(phase: .ended(.declined), cleanup: .closing)

        assert(state, .sessionClosed) { $0.cleanup = .dropping }
        assert(state, .sessionClosed, delivers: .dropLink)
    }

    @Test func droppedLinkCompletesCleanup() {
        let state = makeState(phase: .ended(.declined), cleanup: .dropping)

        assert(state, .linkDropped) { $0.cleanup = .complete }
        assert(state, .linkDropped, delivers: nil)
    }

    @Test func droppedLinkAfterDoneEndsTheFlow() {
        let state = makeState(phase: .ended(.declined), cleanup: .dropping, doneRequested: true)

        assert(state, .linkDropped) {
            $0.cleanup = .complete
            $0.phase = .over
        }
        assert(state, .linkDropped, delivers: nil)
    }

    @Test(arguments: [ClientReview.Cleanup.none, .closing, .dropping])
    func doneBeforeCleanupCompletesWaitsForIt(cleanup: ClientReview.Cleanup) {
        let state = makeState(phase: .ended(.hostCancelled), pendingMessages: cleanup == .none ? 1 : 0, cleanup: cleanup)

        #expect(state.canFinish)
        assert(state, .done) { $0.doneRequested = true }
        assert(state, .done, delivers: nil)
    }

    @Test func doneAfterCleanupEndsTheFlow() {
        let state = makeState(phase: .ended(.hostCancelled), cleanup: .complete)

        assert(state, .done) { $0.phase = .over }
        assert(state, .done, delivers: nil)
    }

    @Test(arguments: [ClientReview.Phase.reviewing, .sending(.confirm), .handedOver, .over])
    func doneOutsideAnEndedReviewIsIgnored(phase: ClientReview.Phase) {
        let state = makeState(phase: phase)

        assert(state, .done)
        assert(state, .done, delivers: nil)
    }

    @Test(arguments: [
        (ClientReview.Cleanup.none, Event.sessionClosed), (.dropping, .sessionClosed), (.complete, .sessionClosed),
        (.none, .linkDropped), (.closing, .linkDropped), (.complete, .linkDropped),
    ])
    func cleanupEventsOutOfOrderAreIgnored(cleanup: ClientReview.Cleanup, event: ClientReview.Event) {
        let state = makeState(phase: .ended(.declined), cleanup: cleanup)

        assert(state, event)
        assert(state, event, delivers: nil)
    }

    // MARK: - Terminal states

    @Test(arguments: [
        ClientReview.Phase.ended(.declined), .ended(.hostCancelled), .ended(.linkLost(.unknown)), .handedOver, .over,
    ], [
        Event.decide(.confirm), .decide(.decline), .message([0x01]), .linkLost,
        .sealed(.confirm, sealed), .written(.confirm, .refused),
    ])
    func terminalStatesRejectLateEvents(phase: ClientReview.Phase, event: ClientReview.Event) {
        let state = makeState(phase: phase, writeStarted: true, cleanup: .complete)

        assert(state, event)
        assert(state, event, delivers: nil)
    }

    // MARK: - Derived values

    @Test(arguments: [
        (ClientReview.Outcome.declined, ClientReview.Charge.notCharged), (.hostCancelled, .notCharged),
        (.linkLost(.notCharged), .notCharged), (.linkLost(.unknown), .unknown),
    ])
    func endedReviewReportsItsCharge(outcome: ClientReview.Outcome, charge: ClientReview.Charge) {
        #expect(makeState(phase: .ended(outcome)).charge == charge)
    }

    @Test func doneRequestedCannotFinishAgain() {
        #expect(!makeState(phase: .ended(.declined), doneRequested: true).canFinish)
    }

    @Test(arguments: [ClientReview.Phase.handedOver, .over])
    func handedOverAndOverAreDone(phase: ClientReview.Phase) {
        #expect(makeState(phase: phase).isDone)
    }
}

// MARK: - Helpers

private func makeState(
    phase: ClientReview.Phase = .reviewing,
    acknowledgedDecision: ClientReview.Decision? = nil,
    writeStarted: Bool = false,
    pendingMessages: Int = 0,
    deferredLinkLoss: ClientReview.Charge? = nil,
    cleanup: ClientReview.Cleanup = .none,
    doneRequested: Bool = false
) -> State {
    State(
        host: host, amount: 12_450, phase: phase, acknowledgedDecision: acknowledgedDecision,
        writeStarted: writeStarted, pendingMessages: pendingMessages, deferredLinkLoss: deferredLinkLoss,
        cleanup: cleanup, doneRequested: doneRequested
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
    #expect(ClientReview.reduce(state, event).0 == expected, sourceLocation: sourceLocation)
}

private func assert(
    _ state: State,
    _ event: Event,
    delivers effect: Effect?,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    #expect(ClientReview.reduce(state, event).1 == effect, sourceLocation: sourceLocation)
}
