import ClientFind
import Testing

@MainActor
struct ClientFindTests {
    @Test func signalWhileScanning() async {
        let host = ClientFind.Host(id: "till", name: "MIZAN-7F3A")
        for scanStarted in [false, true] {
            let answers: [[ClientFind.Answer]] = scanStarted
                ? [[], [.holdCloser], [.host(host)], [.host(host), .none]]
                : [[]]
            for choices in answers {
                let flow = Flow()
                let start = flow.reduce(.bluetoothChanged(.available))
                if scanStarted { await flow.finish(start) }
                for choice in choices { await flow.send(.pickerAnswered(choice)) }
                let before = flow.state
                let calls = flow.ports.calls
                for dBm in [-100, -70, -58, 0] {
                    #expect(flow.reduce(.signalRead(dBm)) == nil)
                    #expect(flow.state.signal == .live(dBm: dBm))
                    #expect(flow.state.selection == before.selection)
                    #expect(flow.state.phase == before.phase)
                    #expect(flow.state.canStart == before.canStart)
                    #expect(flow.state.bluetooth == before.bluetooth)
                    #expect(flow.ports.calls == calls)
                    if !before.canStart {
                        let reading = flow.state
                        #expect(flow.reduce(.start) == nil)
                        #expect(flow.state == reading)
                    }
                }
            }
        }
    }

    @Test func noHostHeard() async {
        for scanStarted in [false, true] {
            let flow = Flow()
            for reading: Int? in [-58, nil] {
                #expect(flow.reduce(.signalRead(reading)) == nil)
                #expect(flow.state == ClientFind.State())
            }
            let start = flow.reduce(.bluetoothChanged(.available))
            if scanStarted { await flow.finish(start) }
            for dBm in [-70, -58] {
                await flow.send(.signalRead(dBm))
                #expect(flow.state.signal == .live(dBm: dBm))
                let before = flow.state
                for _ in 0..<2 {
                    #expect(flow.reduce(.signalRead(nil)) == nil)
                    #expect(flow.state.signal == .none)
                    #expect(flow.state.selection == before.selection)
                    #expect(flow.state.phase == before.phase)
                    #expect(flow.state.canStart == before.canStart)
                    #expect(flow.state.bluetooth == before.bluetooth)
                }
            }
            #expect(flow.ports.calls == (scanStarted ? [.start] : []))
        }
    }

    @Test func signalAtTheStart() async {
        let host = ClientFind.Host(id: "till", name: "MIZAN-7F3A")
        for reading: Int? in [nil, -58] {
            let flow = Flow()
            await flow.send(.bluetoothChanged(.available))
            if reading != nil { await flow.send(.signalRead(-62)) }
            await flow.send(.pickerAnswered(.host(host)))
            if let reading { await flow.send(.signalRead(reading)) }
            let stop = flow.reduce(.start)
            let expected: ClientFind.Signal = reading.map { .atStart(dBm: $0) } ?? .none
            #expect(stop == .stopScanning)
            #expect(flow.state.signal == expected)
            for handedOver in [false, true] {
                if handedOver { await flow.finish(stop) }
                let phase: ClientFind.Phase = handedOver ? .handedOver(host) : .stoppingScan(host)
                for event: ClientFind.Event in [
                    .signalRead(-80), .signalRead(nil),
                    .bluetoothChanged(.unavailable(reason: "off")),
                    .signalRead(-90), .signalRead(nil),
                    .bluetoothChanged(.available),
                    .pickerAnswered(.none), .pickerAnswered(.holdCloser),
                    .pickerAnswered(.host(.init(id: "other", name: "Other"))),
                    .start, .scanningStarted,
                ] {
                    #expect(flow.reduce(event) == nil)
                    #expect(flow.state.signal == expected)
                    #expect(flow.state.phase == phase)
                    #expect(flow.state.selection == .host(host))
                    #expect(!flow.state.canStart)
                }
            }
            #expect(flow.ports.calls == [.start, .stop])
        }
    }

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

    @Test func chosenHostIsReplacedDirectly() async {
        for (firstName, replacementName): (String?, String?) in [
            (nil, nil), (nil, "Market"),
            ("MIZAN-7F3A", nil), ("MIZAN-7F3A", "Market"),
        ] {
            let flow = Flow()
            let first = ClientFind.Host(id: "first-till", name: firstName)
            let replacement = ClientFind.Host(id: "second-till", name: replacementName)
            await flow.send(.bluetoothChanged(.available))
            await flow.send(.pickerAnswered(.host(first)))
            #expect(flow.state.selection == .host(first))
            #expect(flow.state.phase == .scanning)
            #expect(flow.state.canStart)

            await flow.send(.pickerAnswered(.host(replacement)))
            #expect(flow.state.selection == .host(replacement))
            #expect(flow.state.phase == .scanning)
            #expect(flow.state.isScanning)
            #expect(flow.state.canStart)
            #expect(flow.ports.isScanning)
            #expect(flow.ports.calls == [.start])

            await flow.send(.start)
            #expect(flow.state.selection == .host(replacement))
            #expect(flow.state.phase == .handedOver(replacement))
            #expect(!flow.state.isScanning)
            #expect(!flow.state.canStart)
            #expect(!flow.ports.isScanning)
            #expect(flow.ports.calls == [.start, .stop])
        }
    }

    @Test func noClearNearestHost() async {
        for priorAnswers: [ClientFind.Answer] in [
            [], [.none], [.holdCloser],
            [.host(.init(id: "till", name: "MIZAN-7F3A"))],
            [.host(.init(id: "till", name: nil))],
        ] {
            let flow = Flow()
            await flow.send(.bluetoothChanged(.available))
            for answer in priorAnswers {
                await flow.send(.pickerAnswered(answer))
            }
            await flow.send(.pickerAnswered(.holdCloser))
            #expect(flow.state.selection == .holdCloser)
            #expect(!flow.state.canStart)

            await flow.send(.start)
            #expect(flow.state.selection == .holdCloser)
            #expect(flow.state.phase == .scanning)
            #expect(flow.state.isScanning)
            #expect(!flow.state.canStart)
            #expect(flow.ports.isScanning)
            #expect(flow.ports.calls == [.start])
        }
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
        await flow.send(.signalRead(-58))
        await flow.send(.start)
        #expect(flow.state.signal == .atStart(dBm: -58))
        let restart = flow.reduce(.transactionEnded)
        #expect(flow.state.signal == .none)
        #expect(flow.state.phase == .startingScan)
        await flow.finish(restart)
        await flow.send(.transactionEnded)
        #expect(flow.state.phase == .scanning)
        #expect(flow.state.isScanning)
        #expect(flow.state.selection == .none)
        #expect(flow.state.signal == .none)
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
            await flow.send(.signalRead(-58))
            #expect(flow.state.signal == .live(dBm: -58))
            let stop = flow.reduce(.bluetoothChanged(.unavailable(reason: reason)))
            #expect(stop == .stopScanning)
            #expect(flow.state.signal == .none)
            #expect(flow.state.phase == .stoppingScan(nil))
            for reading: Int? in [-80, nil] {
                let before = flow.state
                #expect(flow.reduce(.signalRead(reading)) == nil)
                #expect(flow.state == before)
            }
            await flow.finish(stop)
            for event: ClientFind.Event in [
                .pickerAnswered(.host(host)), .pickerAnswered(.none),
                .pickerAnswered(.holdCloser), .start, .transactionEnded,
                .scanningStarted, .scanningStopped, .signalRead(-80), .signalRead(nil),
            ] {
                await flow.send(event)
                #expect(flow.state.bluetooth == .unavailable(reason: reason))
                #expect(flow.state.phase == .idle)
                #expect(flow.state.selection == .none)
                #expect(flow.state.signal == .none)
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
        await flow.send(.signalRead(-58))
        await flow.send(.start)
        await flow.send(.bluetoothChanged(.unavailable(reason: "off")))
        #expect(flow.state.phase == .handedOver(host))
        #expect(flow.state.bluetooth == .unavailable(reason: "off"))
        #expect(flow.state.signal == .atStart(dBm: -58))
        await flow.send(.transactionEnded)
        #expect(flow.state.signal == .none)
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
        await flow.send(.signalRead(-70))
        #expect(flow.state.signal == .live(dBm: -70))
        #expect(flow.reduce(.bluetoothChanged(.unavailable(reason: "off"))) == nil)
        #expect(flow.state.phase == .startingScan)
        await flow.send(.signalRead(-58))
        #expect(flow.state.signal == .live(dBm: -58))
        await flow.finish(start)
        #expect(flow.state.phase == .idle)
        #expect(flow.state.signal == .none)
        #expect(flow.state.bluetooth == .unavailable(reason: "off"))
        #expect(!flow.state.isScanning)
        #expect(!flow.ports.isScanning)
        #expect(flow.ports.calls == [.start, .stop])

        await flow.send(.bluetoothChanged(.available))
        await flow.send(.pickerAnswered(.host(.init(id: "till", name: "MIZAN-7F3A"))))
        await flow.send(.signalRead(-58))
        let stop = flow.reduce(.bluetoothChanged(.unavailable(reason: "off")))
        #expect(stop == .stopScanning)
        #expect(flow.reduce(.bluetoothChanged(.available)) == nil)
        #expect(flow.state.phase == .stoppingScan(nil))
        #expect(flow.state.signal == .none)
        await flow.finish(stop)
        #expect(flow.state.phase == .scanning)
        #expect(flow.state.signal == .none)
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
        guard let effect else { return }
        for await event in handler.handle(effect) {
            await finish(reduce(event))
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
