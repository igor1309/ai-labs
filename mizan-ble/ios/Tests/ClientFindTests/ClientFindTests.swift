import ClientFind
import Testing

@MainActor
struct ClientFindTests {
    @Test func effectsRunBeforeReturningTheirStreams() async {
        let cases: [(ClientFind.Effect, Ports.Call, ClientFind.Event)] = [
            (.startScanning, .start, .scanningStarted),
            (.stopScanning, .stop, .scanningStopped),
        ]
        for (effect, call, expected) in cases {
            let ports = Ports()
            let handler = ClientFind.EffectHandler(scanner: ports)
            let stream = handler.handle(effect)
            #expect(ports.calls == [call])
            #expect(await collect(stream) == [expected])
        }
    }
}

@MainActor
private final class Ports: ClientFind.Scanner {
    enum Call: Equatable { case start, stop }
    private(set) var calls: [Call] = []
    private(set) var isScanning = false

    func start() {
        calls.append(.start)
        isScanning = true
    }

    func stop() {
        calls.append(.stop)
        isScanning = false
    }
}

@MainActor
private func collect(_ stream: AsyncStream<ClientFind.Event>) async -> [ClientFind.Event] {
    var events: [ClientFind.Event] = []
    for await event in stream { events.append(event) }
    return events
}
