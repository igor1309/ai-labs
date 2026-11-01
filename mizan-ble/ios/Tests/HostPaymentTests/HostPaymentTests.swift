import HostPayment
import Testing

@MainActor
struct HostPaymentTests {
    @Test func effectsRunBeforeReturningTheirStreams() async {
        let cases: [(HostPayment.Effect, Ports.Call, HostPayment.Event)] = [
            (.open([7]), .open([7]), .opened(.decline)),
            (.seal(.acknowledgement), .seal(.acknowledgement), .sealed(.acknowledgement, [83, 17])),
            (.send(.acknowledgement, [83, 17]), .send([83, 17]), .sent(.acknowledgement)),
            (.closeSession, .close, .sessionClosed),
            (.endLink, .end, .linkEnded),
        ]
        for (effect, call, expected) in cases {
            let flow = Flow()
            let stream = flow.handler.handle(effect)
            #expect(flow.ports.calls == [call])
            #expect(await collect(stream) == [expected])
        }
    }

    @Test func waitingForClient() {
        let flow = Flow(amount: "124.50")
        #expect(flow.state.amount == "124.50")
        #expect(flow.state.phase == .awaitingDecision)
        #expect(!flow.state.canEnterNewAmount)
        #expect(!flow.state.resultSent)
        #expect(!flow.state.isOver)
        #expect(flow.ports.calls.isEmpty)
    }

    @Test func clientDeclines() async {
        let flow = Flow()
        await flow.send(.message([9, 4]))
        #expect(flow.state.phase == .declined)
        #expect(flow.state.nothingCharged)
        #expect(flow.state.canEnterNewAmount)
        #expect(!flow.state.resultSent)
        #expect(flow.ports.calls == [
            .open([9, 4]), .seal(.acknowledgement), .send([83, 17]), .close, .end,
        ])
    }

    @Test func clientConfirms() async throws {
        let flow = Flow()
        flow.ports.decision = .confirm
        let open = flow.reduce(.message([7]))
        let opened = await flow.handle(try #require(open))
        let acknowledgement = flow.reduce(try #require(opened))
        #expect(flow.state.phase == .choosingOutcome)
        #expect(!flow.state.canEnterNewAmount)
        #expect(!flow.state.resultSent)
        #expect(!flow.ports.calls.contains(.close))
        await flow.drain(acknowledgement)
        #expect(flow.state.phase == .choosingOutcome)
        #expect(flow.ports.calls == [.open([7]), .seal(.acknowledgement), .send([83, 17])])
    }

    @Test func operatorPicksSuccess() async {
        let flow = Flow()
        flow.ports.decision = .confirm
        await flow.send(.message([7]))
        flow.ports.sealedBytes = [42, 1]
        await flow.send(.outcome(.success))
        #expect(flow.state.phase == .paid)
        #expect(flow.state.resultSent)
        #expect(!flow.state.nothingCharged)
        #expect(flow.state.canEnterNewAmount)
        #expect(flow.state.amount == "124.50")
        #expect(flow.ports.calls.suffix(4) == [.seal(.result(.success)), .send([42, 1]), .close, .end])
    }

    @Test func operatorPicksFailure() async {
        let flow = Flow()
        flow.ports.decision = .confirm
        await flow.send(.message([7]))
        flow.ports.sealedBytes = [42, 0]
        await flow.send(.outcome(.failure))
        #expect(flow.state.phase == .failed)
        #expect(flow.state.resultSent)
        #expect(flow.state.nothingCharged)
        #expect(flow.state.canEnterNewAmount)
        #expect(flow.ports.calls.suffix(4) == [.seal(.result(.failure)), .send([42, 0]), .close, .end])
    }

    @Test func linkDropsBeforeDecision() async {
        let flow = Flow()
        await flow.send(.linkLost)
        #expect(flow.state.phase == .linkLost)
        #expect(flow.state.nothingCharged)
        #expect(flow.state.canEnterNewAmount)
        #expect(!flow.state.resultSent)
        #expect(flow.ports.calls == [.close, .end])
    }

    @Test func linkDropsBeforeOutcome() async {
        let flow = Flow()
        flow.ports.decision = .confirm
        await flow.send(.message([7]))
        await flow.send(.linkLost)
        #expect(flow.state.phase == .linkLost)
        #expect(flow.state.nothingCharged)
        #expect(!flow.state.resultSent)
        #expect(flow.state.canEnterNewAmount)
        #expect(flow.ports.calls == [.open([7]), .seal(.acknowledgement), .send([83, 17]), .close, .end])
    }

    @Test func operatorCancels() async {
        let flow = Flow()
        await flow.send(.cancel)
        #expect(flow.state.phase == .cancelled)
        #expect(flow.state.nothingCharged)
        #expect(flow.state.canEnterNewAmount)
        #expect(!flow.state.resultSent)
        #expect(flow.ports.calls == [.seal(.end), .send([83, 17]), .close, .end])
    }

    @Test func refusedMessageChangesNothing() async {
        let flow = Flow()
        flow.ports.refusesMessage = true
        let before = flow.state
        await flow.send(.message([255, 0]))
        #expect(flow.state == before)
        #expect(flow.state.phase == .awaitingDecision)
        #expect(flow.ports.calls == [.open([255, 0])])
    }

    @Test(arguments: [HostPayment.Outcome.success, .failure])
    func resultCannotBeSent(_ outcome: HostPayment.Outcome) async {
        let flow = Flow()
        flow.ports.decision = .confirm
        await flow.send(.message([7]))
        flow.ports.failsSend = true
        await flow.send(.outcome(outcome))
        #expect(flow.state.phase == .linkLost)
        #expect(!flow.state.resultSent)
        #expect(flow.state.nothingCharged)
        #expect(flow.state.canEnterNewAmount)
        #expect(flow.ports.calls.suffix(4) == [.seal(.result(outcome)), .send([83, 17]), .close, .end])
    }

    @Test func newAmountEndsTheFlow() async {
        let flow = Flow()
        await flow.send(.cancel)
        await flow.send(.newAmount)
        #expect(flow.state.phase == .over)
        #expect(flow.state.isOver)
        #expect(!flow.state.canEnterNewAmount)
        let ended = flow.state
        let calls = flow.ports.calls
        let lateEvents: [HostPayment.Event] = [
            .message([1]), .opened(.confirm), .opened(.decline), .outcome(.success), .outcome(.failure),
            .cancel, .linkLost, .newAmount, .refused,
            .sealed(.end, [1]), .sealed(.acknowledgement, [2]), .sealed(.result(.success), [3]),
            .sent(.acknowledgement), .sent(.end), .sent(.result(.success)),
            .sendFailed(.acknowledgement), .sendFailed(.end), .sendFailed(.result(.success)),
            .sessionClosed, .linkEnded,
        ]
        for event in lateEvents {
            #expect(flow.reduce(event) == nil)
            #expect(flow.state == ended)
        }
        #expect(flow.ports.calls == calls)
    }

    @Test(arguments: [HostPayment.Phase.declined, .paid, .failed, .linkLost, .cancelled])
    func newAmountWaitsForLinkEnded(_ phase: HostPayment.Phase) async throws {
        let acknowledgementSteps = phase == .paid || phase == .failed ? [0, 1, 2] : [0]
        for steps in acknowledgementSteps {
            let flow = Flow()
            var effect: HostPayment.Effect?
            let messages: [HostPayment.Message]
            switch phase {
            case .declined:
                effect = flow.reduce(.opened(.decline))
                messages = [.acknowledgement]
            case .paid, .failed:
                let outcome: HostPayment.Outcome = phase == .paid ? .success : .failure
                var acknowledgement = flow.reduce(.opened(.confirm))
                if steps == 2 {
                    await flow.drain(acknowledgement)
                    acknowledgement = nil
                } else if steps == 1 {
                    let current = try #require(acknowledgement)
                    let event = try #require(await flow.handle(current))
                    acknowledgement = flow.reduce(event)
                }
                let result = flow.reduce(.outcome(outcome))
                if let acknowledgement {
                    #expect(result == nil)
                    effect = acknowledgement
                } else {
                    effect = result
                }
                messages = steps < 2 ? [.acknowledgement, .result(outcome)] : [.result(outcome)]
            case .linkLost:
                effect = flow.reduce(.linkLost)
                messages = []
            case .cancelled:
                effect = flow.reduce(.cancel)
                messages = [.end]
            default:
                Issue.record("Expected a terminal payment phase")
                return
            }

            let expectedEffects: [HostPayment.Effect] = messages.flatMap {
                [.seal($0), .send($0, [83, 17])]
            } + [.closeSession, .endLink]
            let remainingEffects = steps == 1 ? Array(expectedEffects.dropFirst()) : expectedEffects
            #expect(flow.state.phase == phase)

            func expectNewAmountBlocked() {
                let before = flow.state
                #expect(!before.canEnterNewAmount)
                #expect(flow.reduce(.newAmount) == nil)
                #expect(flow.state == before)
            }

            for expected in remainingEffects {
                #expect(effect == expected)
                expectNewAmountBlocked()
                let current = try #require(effect)
                let event = try #require(await flow.handle(current))
                expectNewAmountBlocked()
                effect = flow.reduce(event)
            }

            #expect(effect == nil)
            #expect(flow.state.phase == phase)
            #expect(flow.state.canEnterNewAmount)
            #expect(flow.state.resultSent == (phase == .paid || phase == .failed))
            #expect(flow.ports.calls.suffix(2) == [.close, .end])
            #expect(flow.reduce(.newAmount) == nil)
            #expect(flow.state.isOver)
            #expect(!flow.state.canEnterNewAmount)
        }
    }

    @Test func confirmAcknowledgementCannotBeSent() async {
        let flow = Flow()
        flow.ports.decision = .confirm
        flow.ports.failsSend = true
        await flow.send(.message([7]))
        #expect(flow.state.phase == .linkLost)
        #expect(!flow.state.resultSent)
        #expect(flow.state.nothingCharged)
        #expect(flow.state.canEnterNewAmount)
        #expect(flow.ports.calls == [.open([7]), .seal(.acknowledgement), .send([83, 17]), .close, .end])
    }

    @Test func declineAcknowledgementCannotBeSent() async {
        let flow = Flow()
        flow.ports.failsSend = true
        await flow.send(.message([9]))
        #expect(flow.state.phase == .linkLost)
        #expect(flow.state.nothingCharged)
        #expect(!flow.state.resultSent)
        #expect(flow.state.canEnterNewAmount)
        #expect(flow.ports.calls == [.open([9]), .seal(.acknowledgement), .send([83, 17]), .close, .end])
    }

    @Test(arguments: [HostPayment.Outcome.success, .failure])
    func outcomePickedBeforeAcknowledgementIsQueued(_ outcome: HostPayment.Outcome) async throws {
        let flow = Flow()
        flow.ports.decision = .confirm
        let open = try #require(flow.reduce(.message([7])))
        let opened = try #require(await flow.handle(open))
        let acknowledgement = try #require(flow.reduce(opened))
        #expect(flow.state.phase == .choosingOutcome)
        #expect(flow.reduce(.outcome(outcome)) == nil)
        #expect(flow.state.phase == (outcome == .success ? .paid : .failed))
        #expect(!flow.state.resultSent)
        #expect(flow.reduce(.outcome(.failure)) == nil)
        await flow.drain(acknowledgement)
        #expect(flow.state.resultSent)
        #expect(flow.state.canEnterNewAmount)
        #expect(flow.ports.calls == [
            .open([7]), .seal(.acknowledgement), .send([83, 17]),
            .seal(.result(outcome)), .send([83, 17]), .close, .end,
        ])
    }

    @Test(arguments: [false, true])
    func cancelMessageCannotBeSent(_ failsSeal: Bool) async {
        let flow = Flow()
        flow.ports.failsSeal = failsSeal
        flow.ports.failsSend = !failsSeal
        await flow.send(.cancel)
        #expect(flow.state.phase == .linkLost)
        #expect(flow.state.nothingCharged)
        #expect(!flow.state.resultSent)
        #expect(flow.state.canEnterNewAmount)
        let expected: [Ports.Call] = failsSeal
            ? [.seal(.end), .close, .end]
            : [.seal(.end), .send([83, 17]), .close, .end]
        #expect(flow.ports.calls == expected)
    }

    @Test(arguments: [HostPayment.Message.acknowledgement, .result(.success), .result(.failure), .end],
          [false, true])
    func linkLostDuringSendIgnoresLateCallbacks(_ message: HostPayment.Message, _ sealed: Bool) async throws {
        let flow = Flow()
        var effect: HostPayment.Effect?
        switch message {
        case .acknowledgement:
            let open = try #require(flow.reduce(.message([7])))
            let opened = try #require(await flow.handle(open))
            effect = flow.reduce(opened)
        case .result(let outcome):
            flow.ports.decision = .confirm
            await flow.send(.message([7]))
            effect = flow.reduce(.outcome(outcome))
        case .end:
            effect = flow.reduce(.cancel)
        }
        if sealed {
            let sealing = try #require(effect)
            let event = try #require(await flow.handle(sealing))
            effect = flow.reduce(event)
        }
        #expect(effect != nil)
        await flow.send(.linkLost)
        #expect(flow.state.phase == .linkLost)
        #expect(flow.state.nothingCharged)
        #expect(!flow.state.resultSent)
        #expect(flow.state.canEnterNewAmount)
        let ended = flow.state
        for event: HostPayment.Event in [
            .sealed(message, [83, 17]), .sent(message), .sendFailed(message),
            .linkLost, .sessionClosed, .linkEnded,
        ] {
            #expect(flow.reduce(event) == nil)
            #expect(flow.state == ended)
        }
        #expect(flow.ports.calls.suffix(2) == [.close, .end])
    }

    @Test func refusedMessageDoesNotDiscardTheNextDecision() async throws {
        let flow = Flow()
        let refused = try #require(flow.reduce(.message([0])))
        let valid = try #require(flow.reduce(.message([1])))
        flow.ports.refusesMessage = true
        await flow.drain(refused)
        #expect(flow.state.phase == .awaitingDecision)
        flow.ports.refusesMessage = false
        flow.ports.decision = .confirm
        await flow.drain(valid)
        #expect(flow.state.phase == .choosingOutcome)
        #expect(flow.ports.calls == [.open([0]), .open([1]), .seal(.acknowledgement), .send([83, 17])])
    }
}

@MainActor
private final class Flow {
    var state: HostPayment.State
    let ports = Ports()
    let handler: HostPayment.EffectHandler

    init(amount: String = "124.50") {
        state = .init(amount: amount)
        handler = .init(session: ports, sender: ports, link: ports)
    }

    @discardableResult
    func reduce(_ event: HostPayment.Event) -> HostPayment.Effect? {
        let (next, effect) = HostPayment.reduce(state, event)
        state = next
        return effect
    }

    func send(_ event: HostPayment.Event) async {
        await drain(reduce(event))
    }

    func handle(_ effect: HostPayment.Effect) async -> HostPayment.Event? {
        let events = await collect(handler.handle(effect))
        #expect(events.count == 1)
        return events.first
    }

    func drain(_ first: HostPayment.Effect?) async {
        guard let first else { return }
        for await event in handler.handle(first) {
            await drain(reduce(event))
        }
    }
}

@MainActor
private final class Ports: HostPayment.Session, HostPayment.Sender, HostPayment.Link {
    enum Call: Equatable {
        case open([UInt8]), seal(HostPayment.Message), send([UInt8]), close, end
    }
    enum Failure: Error { case refused, unavailable }

    var calls: [Call] = []
    var decision: HostPayment.Decision = .decline
    var refusesMessage = false
    var failsSend = false
    var failsSeal = false
    var sealedBytes: [UInt8] = [83, 17]

    func open(_ bytes: [UInt8]) throws -> HostPayment.Decision {
        calls.append(.open(bytes))
        if refusesMessage { throw Failure.refused }
        return decision
    }

    func seal(_ message: HostPayment.Message) throws -> [UInt8] {
        calls.append(.seal(message))
        if failsSeal { throw Failure.unavailable }
        return sealedBytes
    }

    func send(_ bytes: [UInt8]) throws {
        calls.append(.send(bytes))
        if failsSend { throw Failure.unavailable }
    }

    func close() { calls.append(.close) }
    func end() { calls.append(.end) }
}

@MainActor
private func collect(_ stream: AsyncStream<HostPayment.Event>) async -> [HostPayment.Event] {
    var events: [HostPayment.Event] = []
    for await event in stream { events.append(event) }
    return events
}
