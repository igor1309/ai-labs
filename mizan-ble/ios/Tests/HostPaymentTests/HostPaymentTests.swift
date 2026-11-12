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

    @Test(arguments: [
        HostPayment.Message.acknowledgement, .result(.success), .result(.failure), .end,
    ], [false, true])
    func failingSealOrSendReportsTheMessageAsNotSent(message: HostPayment.Message, sealing: Bool) async {
        let flow = Flow()
        flow.ports.failsSeal = sealing
        flow.ports.failsSend = !sealing
        let effect: HostPayment.Effect = sealing ? .seal(message) : .send(message, [83, 17])

        let events = await collect(flow.handler.handle(effect))

        #expect(flow.ports.calls == [sealing ? .seal(message) : .send([83, 17])])
        #expect(events == [.sendFailed(message)])
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
