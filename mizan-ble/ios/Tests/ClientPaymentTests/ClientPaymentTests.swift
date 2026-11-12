import ClientPayment
import Testing

@MainActor
struct ClientPaymentTests {
    @Test func effectsRunBeforeReturningTheirStreams() async {
        let cases: [(ClientPayment.Effect, [Ports.Call], ClientPayment.Event)] = [
            (.open([1, 2]), [.open([1, 2])], .opened(.success)),
            (.open([3]), [.open([3])], .opened(.failure)),
            (.open([255]), [.open([255])], .opened(nil)),
            (.finish, [.close, .drop], .finished),
        ]
        for (effect, calls, expected) in cases {
            let opened: ClientPayment.Outcome? = switch expected {
            case .opened(let outcome): outcome
            default: .success
            }
            let ports = Ports(openedResult: opened)
            let handler = ClientPayment.EffectHandler(session: ports, link: ports)
            let stream = handler.handle(effect)
            #expect(ports.calls == calls)
            #expect(await collect(stream) == [expected])
        }
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

@MainActor
private func collect(_ stream: AsyncStream<ClientPayment.Event>) async -> [ClientPayment.Event] {
    var events: [ClientPayment.Event] = []
    for await event in stream { events.append(event) }
    return events
}
