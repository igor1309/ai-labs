import ClientPayment
import Testing

private typealias State = ClientPayment.State
private typealias Event = ClientPayment.Event
private typealias Effect = ClientPayment.Effect

struct ClientPaymentReducerTests {
    @Test(arguments: [("MIZAN-7F3A", 12_450), ("MIZAN-1234", 1), (nil, 99_999_999)] as [(String?, UInt64)])
    func startsWaitingForTheHostWithTheConfirmedAmount(hostName: String?, amount: UInt64) {
        let state = State(hostName: hostName, amountMinorUnits: amount)

        #expect(state == makeState(hostName: hostName, amountMinorUnits: amount, status: .waiting))
    }

    // MARK: - Messages

    @Test(arguments: [[], [0x00], [0xFF, 0x12, 0x34]] as [[UInt8]])
    func messageWhileWaitingIsOpened(message: [UInt8]) {
        let state = makeState()

        assert(state, .message(message)) { $0.pendingMessages = 1 }
        assert(state, .message(message), delivers: .open(message))
    }

    @Test func messageWhileAnotherIsOpeningIsOpenedToo() {
        let state = makeState(pendingMessages: 1)

        assert(state, .message([0x02])) { $0.pendingMessages = 2 }
        assert(state, .message([0x02]), delivers: .open([0x02]))
    }

    @Test func messageAfterTheLinkIsLostIsIgnored() {
        let state = makeState(pendingMessages: 1, linkLost: true)

        assert(state, .message([0x03]))
        assert(state, .message([0x03]), delivers: nil)
    }

    @Test(arguments: [(.success, .paid), (.failure, .failed)] as [(ClientPayment.Outcome, ClientPayment.Status)])
    func hostResultEndsWaitingAndReleasesResources(outcome: ClientPayment.Outcome, status: ClientPayment.Status) {
        let state = makeState(pendingMessages: 1)

        assert(state, .opened(outcome)) {
            $0.status = status
            $0.pendingMessages = 0
        }
        assert(state, .opened(outcome), delivers: .finish)
    }

    @Test func refusedMessageKeepsWaiting() {
        let state = makeState(pendingMessages: 1)

        assert(state, .opened(nil)) { $0.pendingMessages = 0 }
        assert(state, .opened(nil), delivers: nil)
    }

    @Test(arguments: [(.success, .paid), (.failure, .failed)] as [(ClientPayment.Outcome, ClientPayment.Status)])
    func resultWithAnotherMessageStillOpeningWaitsForIt(
        outcome: ClientPayment.Outcome, status: ClientPayment.Status
    ) {
        let state = makeState(pendingMessages: 2)

        assert(state, .opened(outcome)) {
            $0.status = status
            $0.pendingMessages = 1
        }
        assert(state, .opened(outcome), delivers: nil)
    }

    @Test(arguments: [false, true])
    func refusedMessageWithAnotherStillOpeningWaitsForIt(linkLost: Bool) {
        let state = makeState(pendingMessages: 2, linkLost: linkLost)

        assert(state, .opened(nil)) { $0.pendingMessages = 1 }
        assert(state, .opened(nil), delivers: nil)
    }

    /// The link has gone or the payer asked to finish, so the last opened message releases the resources.
    @Test(arguments: [ClientPayment.Outcome.success, .failure, nil], [
        makeState(status: .paid, pendingMessages: 1, linkLost: true),
        makeState(status: .failed, pendingMessages: 1, linkLost: true),
        makeState(status: .paid, doneRequested: true, pendingMessages: 1),
        makeState(status: .failed, doneRequested: true, pendingMessages: 1),
    ])
    func lastMessageOpenedAfterAResultReleasesResources(outcome: ClientPayment.Outcome?, state: ClientPayment.State) {

        assert(state, .opened(outcome)) { $0.pendingMessages = 0 }
        assert(state, .opened(outcome), delivers: .finish)
    }

    @Test(arguments: [ClientPayment.Status.paid, .failed])
    func messageOpenedAfterAResultWithMoreLeftWaits(status: ClientPayment.Status) {
        let state = makeState(status: status, pendingMessages: 2)

        assert(state, .opened(.success)) { $0.pendingMessages = 1 }
        assert(state, .opened(.success), delivers: nil)
    }

    // MARK: - Link loss

    @Test func linkLostBeforeAResultIsLost() {
        let state = makeState()

        assert(state, .linkDropped) {
            $0.linkLost = true
            $0.status = .lost
        }
        assert(state, .linkDropped, delivers: .finish)
    }

    @Test func linkLostWhileAMessageIsOpeningWaitsForIt() {
        let state = makeState(pendingMessages: 1)

        assert(state, .linkDropped) { $0.linkLost = true }
        assert(state, .linkDropped, delivers: nil)
    }

    @Test(arguments: [(.success, .paid), (.failure, .failed)] as [(ClientPayment.Outcome, ClientPayment.Status)])
    func resultReceivedBeforeOpeningSurvivesLinkLoss(outcome: ClientPayment.Outcome, status: ClientPayment.Status) {
        let state = makeState(pendingMessages: 1, linkLost: true)

        assert(state, .opened(outcome)) {
            $0.status = status
            $0.pendingMessages = 0
        }
        assert(state, .opened(outcome), delivers: .finish)
    }

    @Test func refusalReceivedBeforeOpeningResolvesLinkLoss() {
        let state = makeState(pendingMessages: 1, linkLost: true)

        assert(state, .opened(nil)) {
            $0.status = .lost
            $0.pendingMessages = 0
        }
        assert(state, .opened(nil), delivers: .finish)
    }

    // MARK: - Done

    @Test(arguments: [ClientPayment.Status.paid, .failed, .lost])
    func doneBeforeResourcesAreReleasedWaitsForThem(status: ClientPayment.Status) {
        let state = makeState(status: status)

        assert(state, .done) { $0.doneRequested = true }
        assert(state, .done, delivers: nil)
    }

    @Test(arguments: [ClientPayment.Status.paid, .failed, .lost])
    func doneAfterResourcesAreReleasedEndsTheTransaction(status: ClientPayment.Status) {
        let state = makeState(status: status, resourcesReleased: true)

        assert(state, .done) {
            $0.doneRequested = true
            $0.status = .over
        }
        assert(state, .done, delivers: nil)
    }

    @Test(arguments: [ClientPayment.Status.paid, .failed, .lost])
    func resourcesReleasedBeforeDoneAreRecorded(status: ClientPayment.Status) {
        let state = makeState(status: status)

        assert(state, .finished) { $0.resourcesReleased = true }
        assert(state, .finished, delivers: nil)
    }

    @Test(arguments: [ClientPayment.Status.paid, .failed, .lost])
    func resourcesReleasedAfterDoneEndTheTransaction(status: ClientPayment.Status) {
        let state = makeState(status: status, doneRequested: true)

        assert(state, .finished) {
            $0.resourcesReleased = true
            $0.status = .over
        }
        assert(state, .finished, delivers: nil)
    }

    // MARK: - Ignored events

    @Test func doneCannotExitWhileWaiting() {
        let state = makeState(pendingMessages: 1)

        assert(state, .done)
        assert(state, .done, delivers: nil)
    }

    @Test(arguments: [ClientPayment.Status.paid, .failed, .lost], [
        Event.linkDropped, .message([0x00]), .opened(.success), .opened(.failure), .opened(nil),
    ])
    func lateEventsKeepTheFirstResult(status: ClientPayment.Status, event: ClientPayment.Event) {
        let state = makeState(status: status, linkLost: status == .lost)

        assert(state, event)
        assert(state, event, delivers: nil)
    }

    @Test(arguments: [
        Event.done, .finished, .linkDropped, .message([0x01]), .opened(.success), .opened(.failure), .opened(nil),
    ])
    func eventsAfterOverDoNothing(event: ClientPayment.Event) {
        let state = makeState(status: .over, resourcesReleased: true, doneRequested: true)

        assert(state, event)
        assert(state, event, delivers: nil)
    }
}

// MARK: - Helpers

private func makeState(
    hostName: String? = "MIZAN-7F3A",
    amountMinorUnits: UInt64 = 12_450,
    status: ClientPayment.Status = .waiting,
    resourcesReleased: Bool = false,
    doneRequested: Bool = false,
    pendingMessages: Int = 0,
    linkLost: Bool = false
) -> State {
    State(
        hostName: hostName, amountMinorUnits: amountMinorUnits, status: status,
        resourcesReleased: resourcesReleased, doneRequested: doneRequested,
        pendingMessages: pendingMessages, linkLost: linkLost
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
    #expect(ClientPayment.reduce(state, event).0 == expected, sourceLocation: sourceLocation)
}

private func assert(
    _ state: State,
    _ event: Event,
    delivers effect: Effect?,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    #expect(ClientPayment.reduce(state, event).1 == effect, sourceLocation: sourceLocation)
}
