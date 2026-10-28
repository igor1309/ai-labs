import ClientReview
import Testing

typealias Review = ClientReview

struct ClientReviewTests {
    @Test @MainActor func reviewingTheHandedOverAmount() {
        for name: String? in ["MIZAN-7F3A", nil] {
            let flow = Flow(host: .init(id: "host-7", name: name), amount: 12_450)
            #expect(flow.state.host == .init(id: "host-7", name: name))
            #expect(flow.state.amount == 12_450)
            #expect(flow.state.phase == .reviewing)
            #expect(flow.state.canDecide)
            #expect(!flow.state.canFinish)
            #expect(!flow.state.isDone)
            #expect(flow.state.acknowledgedDecision == nil)
            #expect(flow.ports.calls.isEmpty)
        }
    }

    @Test @MainActor func payerDeclines() async {
        let flow = Flow()
        await flow.drive(.decide(.decline))
        flow.ports.opened = .decisionAcknowledged
        await flow.drive(.message([1, 2]))
        #expect(flow.state.phase == .ended(.declined))
        #expect(flow.state.charge == .notCharged)
        #expect(flow.state.acknowledgedDecision == .decline)
        #expect(flow.state.canFinish)
        #expect(!flow.state.canDecide)
        #expect(flow.ports.calls == [.seal(.decline), .write([9, 8, 7]), .open([1, 2]), .close, .drop])
    }

    @Test @MainActor func payerConfirms() async {
        let flow = Flow()
        await flow.drive(.decide(.confirm))
        flow.ports.opened = .decisionAcknowledged
        await flow.drive(.message([3, 4]))
        #expect(flow.state.phase == .handedOver)
        #expect(flow.state.acknowledgedDecision == .confirm)
        #expect(flow.state.isDone)
        #expect(!flow.state.canFinish)
        #expect(!flow.state.canDecide)
        #expect(flow.state.host == .init(id: "host-7", name: "MIZAN-7F3A"))
        #expect(flow.state.amount == 12_450)
        #expect(flow.ports.calls == [.seal(.confirm), .write([9, 8, 7]), .open([3, 4])])
    }

    @Test @MainActor func confirmStaysOnItsWayThroughTheWriteResponse() async throws {
        let flow = Flow()
        flow.ports.holdWrite = true
        let effect = flow.send(.decide(.confirm))
        try #require(flow.state.phase == .sending(.confirm))
        #expect(flow.state.acknowledgedDecision == nil)
        #expect(!flow.state.canDecide)
        let writing = Task { await flow.run(effect) }
        await flow.ports.waitForWrite()
        #expect(flow.state.phase == .sending(.confirm))
        #expect(flow.state.acknowledgedDecision == nil)
        let beforeResponse = flow.state
        flow.ports.finishWrite(.accepted)
        await writing.value
        #expect(flow.state == beforeResponse)
        #expect(flow.state.phase == .sending(.confirm))
        #expect(flow.state.acknowledgedDecision == nil)
        #expect(!flow.state.isDone)
        #expect(flow.ports.calls == [.seal(.confirm), .write([9, 8, 7])])
    }

    @Test @MainActor func declineStaysOnItsWay() async {
        let flow = Flow()
        await flow.drive(.decide(.decline))
        #expect(flow.state.phase == .sending(.decline))
        #expect(flow.state.acknowledgedDecision == nil)
        #expect(!flow.state.canDecide)
        #expect(!flow.state.isDone)
        #expect(flow.ports.calls == [.seal(.decline), .write([9, 8, 7])])
    }

    @Test @MainActor func linkDropsDuringReview() async {
        let flow = Flow()
        await flow.drive(.linkLost)
        #expect(flow.state.phase == .ended(.linkLost(.notCharged)))
        #expect(flow.state.charge == .notCharged)
        #expect(flow.state.canFinish)
        #expect(flow.state.acknowledgedDecision == nil)
        #expect(flow.ports.calls == [.close, .drop])
    }

    @Test @MainActor func linkDropsAfterConfirm() async {
        let flow = Flow()
        await flow.drive(.decide(.confirm))
        await flow.drive(.linkLost)
        #expect(flow.state.phase == .ended(.linkLost(.unknown)))
        #expect(flow.state.charge == .unknown)
        #expect(flow.state.canFinish)
        #expect(flow.state.acknowledgedDecision == nil)
        #expect(flow.ports.calls == [.seal(.confirm), .write([9, 8, 7]), .close, .drop])
    }

    @Test @MainActor func linkDropsAfterDecline() async {
        let flow = Flow()
        await flow.drive(.decide(.decline))
        await flow.drive(.linkLost)
        #expect(flow.state.phase == .ended(.linkLost(.notCharged)))
        #expect(flow.state.charge == .notCharged)
        #expect(flow.state.canFinish)
        #expect(flow.ports.calls == [.seal(.decline), .write([9, 8, 7]), .close, .drop])
    }

    @Test @MainActor func hostCancelsDuringReview() async {
        let flow = Flow()
        flow.ports.opened = .end
        await flow.drive(.message([5, 6]))
        #expect(flow.state.phase == .ended(.hostCancelled))
        #expect(flow.state.charge == .notCharged)
        #expect(flow.state.acknowledgedDecision == nil)
        #expect(flow.state.canFinish)
        #expect(flow.ports.calls == [.open([5, 6]), .close, .drop])
    }

    @Test @MainActor func hostCancelsDuringConfirm() async {
        let flow = Flow()
        await flow.drive(.decide(.confirm))
        flow.ports.opened = .end
        await flow.drive(.message([5, 6]))
        #expect(flow.state.phase == .ended(.hostCancelled))
        #expect(flow.state.charge == .notCharged)
        #expect(flow.state.acknowledgedDecision == nil)
        #expect(flow.ports.calls == [.seal(.confirm), .write([9, 8, 7]), .open([5, 6]), .close, .drop])
    }

    @Test(arguments: [nil, Review.Decision.confirm, .decline], [false, true])
    @MainActor func receivedCancellationSurvivesLinkLoss(_ decision: Review.Decision?, _ cancellationFirst: Bool) async {
        let flow = Flow()
        if let decision { await flow.drive(.decide(decision)) }
        let calls = flow.ports.calls
        let first = flow.send(.message([5]))
        let second = flow.send(.message([6]))
        await flow.drive(.linkLost)
        await flow.drive(.linkLost)
        #expect(flow.ports.calls == calls)
        #expect(!flow.state.canDecide)
        #expect(!flow.state.canFinish)
        #expect(!flow.state.isDone)

        flow.ports.opened = cancellationFirst ? .end : .unrelated
        await flow.run(first)
        #expect(flow.ports.calls == calls + [.open([5])])
        flow.ports.opened = cancellationFirst ? .unrelated : .end
        await flow.run(second)
        #expect(flow.state.phase == .ended(.hostCancelled))
        #expect(flow.state.charge == .notCharged)
        #expect(flow.state.acknowledgedDecision == nil)
        #expect(flow.ports.calls == calls + [.open([5]), .open([6]), .close, .drop])
    }

    @Test(arguments: [Review.Message?.none, .unrelated])
    @MainActor func linkLossWaitsForEveryUninterpretableMessage(_ message: Review.Message?) async {
        let flow = Flow()
        await flow.drive(.decide(.confirm))
        let calls = flow.ports.calls
        let first = flow.send(.message([0]))
        let second = flow.send(.message([255]))
        await flow.drive(.linkLost)
        #expect(flow.ports.calls == calls)
        flow.ports.opened = message
        await flow.run(first)
        #expect(!flow.state.canFinish)
        #expect(flow.ports.calls == calls + [.open([0])])
        await flow.run(second)
        #expect(flow.state.phase == .ended(.linkLost(.unknown)))
        #expect(flow.state.charge == .unknown)
        #expect(flow.ports.calls == calls + [.open([0]), .open([255]), .close, .drop])
    }

    @Test(arguments: [Review.Decision.confirm, .decline])
    @MainActor func receivedAcknowledgementSurvivesLinkLoss(_ decision: Review.Decision) async {
        let flow = Flow()
        await flow.drive(.decide(decision))
        let opening = flow.send(.message([1]))
        await flow.drive(.linkLost)
        flow.ports.opened = .decisionAcknowledged
        await flow.run(opening)
        // A confirm acknowledged on a link already lost is not handed over:
        // the loss would reach no one, and the payer would wait for ever.
        #expect(flow.state.phase == (decision == .confirm ? .ended(.linkLost(.unknown)) : .ended(.declined)))
        #expect(flow.state.charge == (decision == .confirm ? .unknown : .notCharged))
        #expect(flow.state.isDone == false)
        #expect(flow.state.acknowledgedDecision == decision)
        #expect(flow.ports.calls == [.seal(decision), .write([9, 8, 7]), .open([1]), .close, .drop])
    }

    @Test(arguments: [Review.Decision.confirm, .decline])
    @MainActor func receivedCancellationSurvivesWriteRefusal(_ decision: Review.Decision) async {
        let flow = Flow()
        await flow.drive(.decide(decision))
        let opening = flow.send(.message([5, 6]))
        await flow.drive(.written(decision, .refused))
        flow.ports.opened = .end
        await flow.run(opening)
        #expect(flow.state.phase == .ended(.hostCancelled))
        #expect(flow.state.charge == .notCharged)
        #expect(flow.ports.calls == [.seal(decision), .write([9, 8, 7]), .open([5, 6]), .close, .drop])
    }

    @Test(arguments: [Review.Decision.confirm, .decline])
    @MainActor func refusedWriteIsNotCharged(_ decision: Review.Decision) async {
        let flow = Flow()
        flow.ports.writeResult = .refused
        await flow.drive(.decide(decision))
        #expect(flow.state.phase == .ended(.linkLost(.notCharged)))
        #expect(flow.state.charge == .notCharged)
        #expect(flow.state.acknowledgedDecision == nil)
        #expect(flow.ports.calls == [.seal(decision), .write([9, 8, 7]), .close, .drop])
    }

    @Test @MainActor func refusedMessageChangesNothing() async {
        let flow = Flow()
        flow.ports.opened = nil
        let before = flow.state
        await flow.drive(.message([0, 255]))
        #expect(flow.state == before)
        #expect(flow.state.phase == .reviewing)
        #expect(flow.state.canDecide)
        #expect(flow.ports.calls == [.open([0, 255])])
    }

    @Test @MainActor func payerIsDone() async {
        let flow = Flow()
        await flow.drive(.decide(.decline))
        flow.ports.opened = .decisionAcknowledged
        await flow.drive(.message([1]))
        #expect(flow.state.phase == .ended(.declined))
        #expect(flow.state.charge == .notCharged)
        let calls = flow.ports.calls
        await flow.drive(.done)
        #expect(flow.state.phase == .over)
        #expect(flow.state.isDone)
        #expect(!flow.state.canDecide)
        #expect(!flow.state.canFinish)
        #expect(flow.ports.calls == calls)
    }

    @Test @MainActor func hostCancelsDuringHeldDecline() async throws {
        let flow = Flow()
        flow.ports.holdWrite = true
        let effect = flow.send(.decide(.decline))
        try #require(flow.state.phase == .sending(.decline))
        let writing = Task { await flow.run(effect) }
        await flow.ports.waitForWrite()
        flow.ports.opened = .end
        await flow.drive(.message([5, 6]))
        #expect(flow.state.phase == .ended(.hostCancelled))
        #expect(flow.state.charge == .notCharged)
        #expect(flow.ports.calls == [.seal(.decline), .write([9, 8, 7]), .open([5, 6]), .close, .drop])
        let ended = flow.state
        flow.ports.finishWrite(.accepted)
        await writing.value
        #expect(flow.state == ended)
        #expect(flow.state.acknowledgedDecision == nil)
    }

    @Test(arguments: [Review.Decision.confirm, .decline])
    @MainActor func acknowledgementCanPrecedeTheWriteResponse(_ decision: Review.Decision) async throws {
        let flow = Flow()
        flow.ports.holdWrite = true
        let effect = flow.send(.decide(decision))
        try #require(flow.state.phase == .sending(decision))
        let writing = Task { await flow.run(effect) }
        await flow.ports.waitForWrite()
        flow.ports.opened = .decisionAcknowledged
        await flow.drive(.message([1]))
        #expect(flow.state.phase == (decision == .confirm ? .handedOver : .ended(.declined)))
        #expect(flow.state.acknowledgedDecision == decision)
        let acknowledged = flow.state
        let calls = flow.ports.calls
        flow.ports.finishWrite(.refused)
        await writing.value
        #expect(flow.state == acknowledged)
        #expect(flow.ports.calls == calls)
    }

    @Test(arguments: [Review.Decision.confirm, .decline])
    @MainActor func aDecisionIsSentOnlyOnce(_ decision: Review.Decision) async {
        let flow = Flow(largestWrite: 4)
        flow.ports.sealed = [2, 4, 6, 8]
        await flow.drive(.decide(decision))
        #expect(flow.state.phase == .sending(decision))
        let pending = flow.state
        for repeated: Review.Decision in [.confirm, .decline] {
            await flow.drive(.decide(repeated))
            await flow.drive(.done)
            #expect(flow.state == pending)
        }
        #expect(flow.ports.calls == [.seal(decision), .write([2, 4, 6, 8])])
    }

    @Test @MainActor func unrelatedMessagesAndEarlyAcknowledgementsAreIgnored() async {
        let flow = Flow()
        for message: Review.Message in [.unrelated, .decisionAcknowledged] {
            flow.ports.opened = message
            let before = flow.state
            await flow.drive(.message([7]))
            #expect(flow.state == before)
        }
        let sealing = flow.send(.decide(.confirm))
        #expect(flow.state.phase == .sending(.confirm))
        let pending = flow.state
        await flow.drive(.message([7]))
        #expect(flow.state == pending)
        await flow.run(sealing)
        flow.ports.opened = .unrelated
        let written = flow.state
        await flow.drive(.message([7]))
        #expect(flow.state == written)
        #expect(flow.ports.calls == [.open([7]), .open([7]), .open([7]), .seal(.confirm), .write([9, 8, 7]), .open([7])])
    }

    @Test @MainActor func terminalStatesRejectLateEvents() async {
        for confirm in [false, true] {
            let flow = Flow()
            await flow.drive(.decide(confirm ? .confirm : .decline))
            flow.ports.opened = .decisionAcknowledged
            await flow.drive(.message([1]))
            #expect(flow.state.phase == (confirm ? .handedOver : .ended(.declined)))
            for finish in [false, true] {
                if finish { await flow.drive(.done) }
                let ended = flow.state
                let calls = flow.ports.calls
                for event: Review.Event in [
                    .decide(.confirm), .decide(.decline), .message([9]), .linkLost,
                    .sealed(.confirm, [8]), .written(.decline, .refused),
                    .opened(.end), .opened(.decisionAcknowledged), .sessionClosed, .linkDropped,
                ] {
                    await flow.drive(event)
                    #expect(flow.state == ended)
                    #expect(flow.ports.calls == calls)
                }
            }
        }
    }

    @Test @MainActor func cleanupContinuesAfterDone() async throws {
        let flow = Flow()
        let close = flow.send(.linkLost)
        try #require(flow.state.phase == .ended(.linkLost(.notCharged)))
        #expect(close == .closeSession)
        await flow.drive(.done)
        #expect(flow.state.phase == .ended(.linkLost(.notCharged)))
        #expect(!flow.state.isDone)
        #expect(!flow.state.canFinish)
        await flow.run(close)
        #expect(flow.state.phase == .over)
        #expect(flow.state.isDone)
        #expect(flow.ports.calls == [.close, .drop])
    }
}

@MainActor private final class Flow {
    var state: Review.State
    let ports: Ports
    let handler: Review.EffectHandler

    init(
        host: Review.Host = .init(id: "host-7", name: "MIZAN-7F3A"),
        amount: UInt64 = 12_450, largestWrite: Int = 34
    ) {
        state = Review.State(host: host, amount: amount)
        ports = Ports(largestWrite: largestWrite)
        handler = Review.EffectHandler(session: ports, sender: ports, link: ports)
    }

    func send(_ event: Review.Event) -> Review.Effect? {
        let (next, effect) = Review.reduce(state, event)
        state = next
        return effect
    }

    func drive(_ event: Review.Event) async {
        await run(send(event))
    }

    func run(_ initial: Review.Effect?) async {
        var effect = initial
        while let pending = effect {
            if let result = await handler.handle(pending) {
                effect = send(result)
            } else {
                effect = nil
            }
        }
    }
}

@MainActor private final class Ports: Review.Session, Review.Sender, Review.Link {
    enum Call: Equatable {
        case seal(Review.Decision), write([UInt8]), open([UInt8]), close, drop
    }
    let largestWrite: Int
    var calls: [Call] = []
    var sealed: [UInt8] = [9, 8, 7]
    var opened: Review.Message?
    var writeResult: Review.WriteResult = .accepted
    var holdWrite = false
    private var writeAnswer: CheckedContinuation<Review.WriteResult, Never>?
    private var writeWaiter: CheckedContinuation<Void, Never>?

    init(largestWrite: Int) {
        self.largestWrite = largestWrite
    }

    func seal(_ decision: Review.Decision) -> [UInt8] {
        calls.append(.seal(decision))
        return sealed
    }

    func open(_ bytes: [UInt8]) -> Review.Message? {
        calls.append(.open(bytes))
        return opened
    }

    func write(_ bytes: [UInt8]) async -> Review.WriteResult {
        calls.append(.write(bytes))
        guard bytes.count <= largestWrite else { return .refused }
        writeWaiter?.resume()
        writeWaiter = nil
        if holdWrite {
            return await withCheckedContinuation { writeAnswer = $0 }
        }
        return writeResult
    }

    func waitForWrite() async {
        if calls.contains(where: { if case .write = $0 { true } else { false } }) { return }
        await withCheckedContinuation { writeWaiter = $0 }
    }

    func finishWrite(_ result: Review.WriteResult) {
        writeAnswer?.resume(returning: result)
        writeAnswer = nil
    }

    func close() { calls.append(.close) }
    func drop() { calls.append(.drop) }
}
