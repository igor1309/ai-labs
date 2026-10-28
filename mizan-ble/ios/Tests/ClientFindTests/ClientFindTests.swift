import ClientFind
import Testing

@MainActor
struct ClientFindTests {
    @Test func noHostNearby() async {
        let flow = Flow()
        #expect(flow.state == ClientFind.State())
        #expect(!flow.state.canStart)
        await flow.send(.bluetoothChanged(.available))
        await flow.send(.pickerAnswered(.none))
        await flow.send(.start)
        #expect(flow.state.phase == .scanning)
        #expect(flow.state.isScanning)
        #expect(flow.state.selection == .none)
        #expect(!flow.state.canStart)
        #expect(flow.ports.isScanning)
        #expect(flow.ports.calls == [.start])
    }

    @Test func aHostIsChosen() async {
        for host in [
            ClientFind.Host(id: "first", name: "MIZAN-7F3A"),
            ClientFind.Host(id: "second", name: "Market"),
        ] {
            let flow = Flow()
            await flow.send(.bluetoothChanged(.available))
            await flow.send(.pickerAnswered(.host(host)))
            await flow.send(.bluetoothChanged(.available))
            #expect(flow.state.selection == .host(host))
            #expect(flow.state.phase == .scanning)
            #expect(flow.state.canStart)
            #expect(flow.ports.calls == [.start])
        }
    }

    @Test func noClearNearestHost() async {
        let flow = Flow()
        await flow.send(.bluetoothChanged(.available))
        await flow.send(.pickerAnswered(.holdCloser))
        await flow.send(.start)
        #expect(flow.state.selection == .holdCloser)
        #expect(flow.state.phase == .scanning)
        #expect(flow.state.isScanning)
        #expect(!flow.state.canStart)
        #expect(flow.ports.calls == [.start])
    }

    @Test func chosenHostGoesQuiet() async {
        let flow = Flow()
        let host = ClientFind.Host(id: "till", name: "MIZAN-7F3A")
        await flow.send(.bluetoothChanged(.available))
        await flow.send(.pickerAnswered(.host(host)))
        for _ in 0..<2 {
            await flow.send(.pickerAnswered(.none))
            await flow.send(.start)
            #expect(flow.state.selection == .gone)
            #expect(flow.state.phase == .scanning)
            #expect(!flow.state.canStart)
        }
        let replacement = ClientFind.Host(id: "other-till", name: "Market")
        await flow.send(.pickerAnswered(.host(replacement)))
        #expect(flow.state.selection == .host(replacement))
        #expect(flow.state.canStart)
        #expect(flow.ports.calls == [.start])
    }

    @Test func goneHostStaysGoneUntilAHostIsOffered() async {
        let flow = Flow()
        let host = ClientFind.Host(id: "till", name: "MIZAN-7F3A")
        await flow.send(.bluetoothChanged(.available))
        await flow.send(.pickerAnswered(.host(host)))
        await flow.send(.pickerAnswered(.none))
        for answer: ClientFind.Answer in [.holdCloser, .none, .holdCloser] {
            await flow.send(.pickerAnswered(answer))
            #expect(flow.state.selection == .gone)
            #expect(!flow.state.canStart)
            #expect(flow.state.isScanning)
        }
        await flow.send(.pickerAnswered(.host(host)))
        #expect(flow.state.selection == .host(host))
        #expect(flow.state.canStart)
        #expect(flow.ports.calls == [.start])
    }

    @Test func startingTheHandshake() async {
        for name: String? in [nil, "MIZAN-7F3A"] {
            let flow = Flow()
            let host = ClientFind.Host(id: "till", name: name)
            await flow.send(.bluetoothChanged(.available))
            await flow.send(.pickerAnswered(.host(host)))
            await flow.send(.start)
            #expect(flow.state.phase == .handedOver(host))
            #expect(flow.state.selection == .host(host))
            #expect(!flow.state.isScanning)
            #expect(!flow.state.canStart)
            #expect(!flow.ports.isScanning)
            #expect(flow.ports.calls == [.start, .stop])

            for event: ClientFind.Event in [
                .pickerAnswered(.none), .pickerAnswered(.holdCloser),
                .pickerAnswered(.host(.init(id: "other", name: "Other"))),
                .start, .scanningStarted, .scanningStopped,
                .bluetoothChanged(.unavailable(reason: "off")),
                .bluetoothChanged(.available),
            ] {
                await flow.send(event)
                #expect(flow.state.phase == .handedOver(host))
                #expect(flow.state.selection == .host(host))
                #expect(!flow.state.canStart)
                #expect(flow.ports.calls == [.start, .stop])
            }
        }
    }

    @Test func backToScanning() async {
        let flow = Flow()
        let host = ClientFind.Host(id: "till", name: "MIZAN-7F3A")
        await flow.send(.bluetoothChanged(.available))
        await flow.send(.pickerAnswered(.host(host)))
        await flow.send(.start)
        await flow.send(.transactionEnded)
        await flow.send(.transactionEnded)
        #expect(flow.state.phase == .scanning)
        #expect(flow.state.isScanning)
        #expect(flow.state.selection == .none)
        #expect(!flow.state.canStart)
        #expect(flow.ports.isScanning)
        #expect(flow.ports.calls == [.start, .stop, .start])
        await flow.send(.pickerAnswered(.host(host)))
        await flow.send(.start)
        #expect(flow.state.phase == .handedOver(host))
        #expect(flow.ports.calls == [.start, .stop, .start, .stop])
    }

    @Test func bluetoothIsNotAvailable() async {
        for reason in ["not allowed", "off", "unsupported"] {
            let flow = Flow()
            let host = ClientFind.Host(id: "till", name: "MIZAN-7F3A")
            await flow.send(.bluetoothChanged(.available))
            await flow.send(.pickerAnswered(.host(host)))
            await flow.send(.bluetoothChanged(.unavailable(reason: reason)))
            for event: ClientFind.Event in [
                .pickerAnswered(.host(host)), .pickerAnswered(.none),
                .pickerAnswered(.holdCloser), .start, .transactionEnded,
                .scanningStarted, .scanningStopped,
            ] {
                await flow.send(event)
                #expect(flow.state.bluetooth == .unavailable(reason: reason))
                #expect(flow.state.phase == .idle)
                #expect(flow.state.selection == .none)
                #expect(!flow.state.isScanning)
                #expect(!flow.state.canStart)
                #expect(!flow.ports.isScanning)
                #expect(flow.ports.calls == [.start, .stop])
            }
        }
    }

    @Test func bluetoothComesBack() async {
        let flow = Flow()
        await flow.send(.bluetoothChanged(.unavailable(reason: "not allowed")))
        await flow.send(.bluetoothChanged(.available))
        #expect(flow.state.bluetooth == .available)
        #expect(flow.state.phase == .scanning)
        #expect(flow.state.selection == .none)
        #expect(flow.state.isScanning)
        #expect(!flow.state.canStart)
        #expect(flow.ports.calls == [.start])
    }

    @Test func aHostWithNoNameYet() async {
        let flow = Flow()
        let unnamed = ClientFind.Host(id: "till", name: nil)
        let named = ClientFind.Host(id: "till", name: "MIZAN-7F3A")
        await flow.send(.bluetoothChanged(.available))
        await flow.send(.pickerAnswered(.host(unnamed)))
        #expect(flow.state.selection == .host(unnamed))
        #expect(flow.state.canStart)
        await flow.send(.pickerAnswered(.host(named)))
        #expect(flow.state.selection == .host(named))
        #expect(flow.state.canStart)
        await flow.send(.start)
        #expect(flow.state.phase == .handedOver(named))
    }

    @Test func handoverWaitsForScanningToStop() async {
        let flow = Flow()
        let host = ClientFind.Host(id: "till", name: "MIZAN-7F3A")
        await flow.send(.bluetoothChanged(.available))
        await flow.send(.pickerAnswered(.host(host)))
        let effect = flow.reduce(.start)
        #expect(effect == .stopScanning)
        #expect(flow.state.phase == .stoppingScan(host))
        #expect(flow.state.isScanning)
        #expect(!flow.state.canStart)
        #expect(flow.ports.isScanning)
        for event: ClientFind.Event in [
            .start, .transactionEnded, .scanningStarted,
            .pickerAnswered(.host(.init(id: "other", name: "Other"))),
            .pickerAnswered(.none), .bluetoothChanged(.available),
        ] {
            #expect(flow.reduce(event) == nil)
            #expect(flow.state.phase == .stoppingScan(host))
        }
        await flow.finish(effect)
        #expect(flow.state.phase == .handedOver(host))
        #expect(!flow.state.isScanning)
        #expect(!flow.ports.isScanning)
        #expect(flow.ports.calls == [.start, .stop])
    }

    @Test func scanStartsOnlyWhenBluetoothIsAvailable() async {
        let flow = Flow()
        let host = ClientFind.Host(id: "till", name: "MIZAN-7F3A")
        for event: ClientFind.Event in [
            .pickerAnswered(.host(host)), .start, .transactionEnded,
            .scanningStarted, .scanningStopped,
        ] {
            await flow.send(event)
            #expect(flow.state == ClientFind.State())
            #expect(flow.ports.calls.isEmpty)
        }
        let effect = flow.reduce(.bluetoothChanged(.available))
        #expect(effect == .startScanning)
        #expect(flow.state.phase == .startingScan)
        #expect(!flow.state.isScanning)
        #expect(!flow.state.canStart)
        #expect(flow.reduce(.bluetoothChanged(.available)) == nil)
        #expect(flow.reduce(.pickerAnswered(.host(host))) == nil)
        #expect(flow.state.selection == .none)
        await flow.finish(effect)
        #expect(flow.state.phase == .scanning)
        #expect(flow.state.isScanning)
        #expect(flow.ports.calls == [.start])
    }

    @Test func transactionEndsWhileBluetoothIsUnavailable() async {
        let flow = Flow()
        let host = ClientFind.Host(id: "till", name: "MIZAN-7F3A")
        await flow.send(.bluetoothChanged(.available))
        await flow.send(.pickerAnswered(.host(host)))
        await flow.send(.start)
        await flow.send(.bluetoothChanged(.unavailable(reason: "off")))
        #expect(flow.state.phase == .handedOver(host))
        #expect(flow.state.bluetooth == .unavailable(reason: "off"))
        await flow.send(.transactionEnded)
        #expect(flow.state.phase == .idle)
        #expect(flow.state.bluetooth == .unavailable(reason: "off"))
        #expect(flow.state.selection == .none)
        #expect(!flow.state.canStart)
        #expect(!flow.state.isScanning)
        #expect(flow.ports.calls == [.start, .stop])
        await flow.send(.bluetoothChanged(.available))
        #expect(flow.state.phase == .scanning)
        #expect(flow.state.selection == .none)
        #expect(flow.ports.calls == [.start, .stop, .start])
    }

    @Test func scannerCommandsFinishInOrderDuringBluetoothChanges() async {
        let flow = Flow()
        let start = flow.reduce(.bluetoothChanged(.available))
        #expect(flow.reduce(.bluetoothChanged(.unavailable(reason: "off"))) == nil)
        #expect(flow.state.phase == .startingScan)
        await flow.finish(start)
        #expect(flow.state.phase == .idle)
        #expect(flow.state.bluetooth == .unavailable(reason: "off"))
        #expect(!flow.state.isScanning)
        #expect(!flow.ports.isScanning)
        #expect(flow.ports.calls == [.start, .stop])

        await flow.send(.bluetoothChanged(.available))
        await flow.send(.pickerAnswered(.host(.init(id: "till", name: "MIZAN-7F3A"))))
        let stop = flow.reduce(.bluetoothChanged(.unavailable(reason: "off")))
        #expect(stop == .stopScanning)
        #expect(flow.reduce(.bluetoothChanged(.available)) == nil)
        #expect(flow.state.phase == .stoppingScan(nil))
        await flow.finish(stop)
        #expect(flow.state.phase == .scanning)
        #expect(flow.state.selection == .none)
        #expect(!flow.state.canStart)
        #expect(flow.ports.isScanning)
        #expect(flow.ports.calls == [.start, .stop, .start, .stop, .start])
    }
}

@MainActor
private final class Flow {
    private(set) var state = ClientFind.State()
    let ports = Ports()
    private let handler: ClientFind.EffectHandler

    init() {
        handler = ClientFind.EffectHandler(scanner: ports)
    }

    func reduce(_ event: ClientFind.Event) -> ClientFind.Effect? {
        let (next, effect) = ClientFind.reduce(state, event)
        state = next
        return effect
    }

    func send(_ event: ClientFind.Event) async {
        await finish(reduce(event))
    }

    func finish(_ effect: ClientFind.Effect?) async {
        var pending = effect
        while let effect = pending {
            guard let event = await handler.handle(effect) else { return }
            pending = reduce(event)
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
