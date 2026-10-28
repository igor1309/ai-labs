import ClientPayment
import Testing

@MainActor
struct ClientPaymentTests {
    @Test func waitingForTheHost() {
        for (host, amount): (String?, UInt64) in [
            ("MIZAN-7F3A", 12_450), ("MIZAN-1234", 1), (nil, 99_999_999),
        ] {
            let ports = Ports(openedResult: nil)
            let flow = Flow(ports: ports, hostName: host, amountMinorUnits: amount)
            #expect(flow.state.status == .waiting)
            #expect(flow.state.hostName == host)
            #expect(flow.state.amountMinorUnits == amount)
            #expect(ports.calls.isEmpty)
        }
    }

    @Test func hostReportsSuccess() async {
        let ports = Ports(openedResult: .success)
        let flow = Flow(ports: ports, hostName: "MIZAN-7F3A", amountMinorUnits: 12_450)
        await flow.send(.message([0x42, 0x17]))
        #expect(flow.state.status == .paid)
        #expect(flow.state.amountMinorUnits == 12_450)
        #expect(flow.state.hostName == "MIZAN-7F3A")
        #expect(ports.calls == [.open([0x42, 0x17]), .close, .drop])
    }

    @Test func hostReportsFailure() async {
        let ports = Ports(openedResult: .failure)
        let flow = Flow(ports: ports, hostName: "MIZAN-7F3A", amountMinorUnits: 12_450)
        await flow.send(.message([0x29]))
        #expect(flow.state.status == .failed)
        #expect(flow.state.amountMinorUnits == 12_450)
        #expect(flow.state.hostName == "MIZAN-7F3A")
        #expect(ports.calls == [.open([0x29]), .close, .drop])
    }

    @Test func linkLostBeforeAResult() async {
        let ports = Ports(openedResult: nil)
        let flow = Flow(ports: ports, hostName: "MIZAN-7F3A", amountMinorUnits: 12_450)
        await flow.send(.linkDropped)
        #expect(flow.state.status == .lost)
        #expect(flow.state.hostName == "MIZAN-7F3A")
        #expect(flow.state.amountMinorUnits == 12_450)
        #expect(ports.calls == [.close, .drop])
    }

    @Test func refusedMessageKeepsWaiting() async {
        let ports = Ports(openedResult: nil)
        let flow = Flow(ports: ports, hostName: "MIZAN-7F3A", amountMinorUnits: 12_450)
        let before = flow.state
        for message: [UInt8] in [[], [0x00], [0xFF, 0x12, 0x34]] {
            await flow.send(.message(message))
            #expect(flow.state == before)
            #expect(flow.state.status == .waiting)
        }
        #expect(ports.calls == [.open([]), .open([0x00]), .open([0xFF, 0x12, 0x34])])
        ports.openedResult = .success
        await flow.send(.message([0x51]))
        #expect(flow.state.status == .paid)
        #expect(ports.calls == [
            .open([]), .open([0x00]), .open([0xFF, 0x12, 0x34]), .open([0x51]), .close, .drop,
        ])
    }

    @Test func doneEndsTheTransaction() async {
        for (outcome, status): (ClientPayment.Outcome?, ClientPayment.Status) in [
            (.success, .paid), (.failure, .failed), (nil, .lost),
        ] {
            let ports = Ports(openedResult: outcome)
            let flow = Flow(ports: ports, hostName: "MIZAN-7F3A", amountMinorUnits: 12_450)
            await flow.send(outcome == nil ? .linkDropped : .message([0x21]))
            #expect(flow.state.status == status)
            await flow.send(.done)
            #expect(flow.state.status == .over)
            #expect(flow.state.hostName == "MIZAN-7F3A")
            #expect(flow.state.amountMinorUnits == 12_450)
            let expected: [Ports.Call] = outcome == nil
                ? [.close, .drop] : [.open([0x21]), .close, .drop]
            #expect(ports.calls == expected)
        }
    }

    @Test func doneCannotExitWhileWaiting() async {
        let ports = Ports(openedResult: nil)
        let flow = Flow(ports: ports, hostName: "MIZAN-7F3A", amountMinorUnits: 12_450)
        let before = flow.state
        await flow.send(.done)
        #expect(flow.state == before)
        #expect(flow.state.status == .waiting)
        #expect(ports.calls.isEmpty)
    }

    @Test func doneWaitsForCleanup() async throws {
        for (event, status): (ClientPayment.Event, ClientPayment.Status) in [
            (.opened(.success), .paid), (.opened(.failure), .failed), (.linkDropped, .lost),
        ] {
            let ports = Ports(openedResult: nil)
            let flow = Flow(ports: ports, hostName: "MIZAN-7F3A", amountMinorUnits: 12_450)
            let cleanup = try #require(flow.receive(event))
            await flow.send(.done)
            #expect(flow.state.status == status)
            #expect(ports.calls.isEmpty)
            await flow.handle(cleanup)
            #expect(flow.state.status == .over)
            #expect(ports.calls == [.close, .drop])
        }
    }

    @Test func lateEventsKeepTheFirstResult() async {
        for (outcome, status): (ClientPayment.Outcome?, ClientPayment.Status) in [
            (.success, .paid), (.failure, .failed), (nil, .lost),
        ] {
            let ports = Ports(openedResult: outcome)
            let flow = Flow(ports: ports, hostName: "MIZAN-7F3A", amountMinorUnits: 12_450)
            await flow.send(outcome == nil ? .linkDropped : .message([0x82]))
            let before = flow.state
            let calls = ports.calls
            for event: ClientPayment.Event in [
                .linkDropped, .message([0x00]), .opened(.success), .opened(.failure), .opened(nil),
            ] {
                await flow.send(event)
                #expect(flow.state.status == status)
                #expect(flow.state == before)
                #expect(ports.calls == calls)
            }
        }
    }

    @Test func eventsAfterDoneDoNothing() async {
        let ports = Ports(openedResult: .success)
        let flow = Flow(ports: ports, hostName: "MIZAN-7F3A", amountMinorUnits: 12_450)
        await flow.send(.message([0x63]))
        await flow.send(.done)
        let before = flow.state
        for event: ClientPayment.Event in [
            .done, .linkDropped, .message([0x01]), .opened(.success), .opened(.failure), .opened(nil),
        ] {
            await flow.send(event)
            #expect(flow.state == before)
            #expect(flow.state.status == .over)
            #expect(ports.calls == [.open([0x63]), .close, .drop])
        }
    }
}

@MainActor
private final class Flow {
    private(set) var state: ClientPayment.State
    private let handler: ClientPayment.EffectHandler

    init(ports: Ports, hostName: String?, amountMinorUnits: UInt64) {
        state = ClientPayment.State(hostName: hostName, amountMinorUnits: amountMinorUnits)
        handler = ClientPayment.EffectHandler(session: ports, link: ports)
    }

    func send(_ event: ClientPayment.Event) async {
        if let effect = receive(event) { await handle(effect) }
    }

    func receive(_ event: ClientPayment.Event) -> ClientPayment.Effect? {
        let (next, effect) = ClientPayment.reduce(state, event)
        state = next
        return effect
    }

    func handle(_ effect: ClientPayment.Effect) async {
        if let event = await handler.handle(effect) { await send(event) }
    }
}

@MainActor
private final class Ports: ClientPayment.Session, ClientPayment.Link {
    enum Call: Equatable {
        case open([UInt8]), close, drop
    }

    var openedResult: ClientPayment.Outcome?
    private(set) var calls: [Call] = []

    init(openedResult: ClientPayment.Outcome?) {
        self.openedResult = openedResult
    }

    func open(_ message: [UInt8]) -> ClientPayment.Outcome? {
        calls.append(.open(message))
        return openedResult
    }

    func close() { calls.append(.close) }
    func drop() { calls.append(.drop) }
}
