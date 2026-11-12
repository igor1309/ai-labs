import ClientFind
import Testing

private typealias State = ClientFind.State
private typealias Event = ClientFind.Event
private typealias Effect = ClientFind.Effect

private let till = ClientFind.Host(id: "till", name: "MIZAN-7F3A")
private let other = ClientFind.Host(id: "other-till", name: "Market")
private let unnamed = ClientFind.Host(id: "till", name: nil)
private let off = ClientFind.Bluetooth.unavailable(reason: "off")

struct ClientFindReducerTests {
    @Test func startsIdleWaitingForBluetooth() {
        #expect(State() == makeState(bluetooth: .unknown, phase: .idle))
    }

    // MARK: - Signal

    @Test(arguments: [ClientFind.Phase.startingScan, .scanning], [ClientFind.Selection.none, .host(till), .holdCloser, .gone])
    func signalReadWhileScanningIsShownLive(phase: ClientFind.Phase, selection: ClientFind.Selection) {
        let state = makeState(selection: selection, phase: phase)

        assert(state, .signalRead(-58)) { $0.signal = .live(dBm: -58) }
        assert(state, .signalRead(-58), delivers: nil)
    }

    @Test(arguments: [ClientFind.Phase.startingScan, .scanning], [ClientFind.Selection.none, .host(till), .holdCloser, .gone])
    func noSignalWhileScanningClearsIt(phase: ClientFind.Phase, selection: ClientFind.Selection) {
        let state = makeState(selection: selection, phase: phase, signal: .live(dBm: -70))

        assert(state, .signalRead(nil)) { $0.signal = .none }
        assert(state, .signalRead(nil), delivers: nil)
    }

    @Test(arguments: [
        ClientFind.Phase.idle, .stoppingScan(till), .stoppingScan(nil), .handedOver(till),
    ])
    func signalReadOutsideScanningIsIgnored(phase: ClientFind.Phase) {
        let state = makeState(phase: phase, signal: .atStart(dBm: -58))

        assert(state, .signalRead(-80))
        assert(state, .signalRead(-80), delivers: nil)
    }

    // MARK: - Bluetooth

    @Test func bluetoothAvailableWhileIdleStartsScanning() {
        let state = makeState(bluetooth: .unknown, phase: .idle)

        assert(state, .bluetoothChanged(.available)) {
            $0.bluetooth = .available
            $0.phase = .startingScan
        }
        assert(state, .bluetoothChanged(.available), delivers: .startScanning)
    }

    @Test(arguments: ["not allowed", "off", "unsupported"])
    func bluetoothUnavailableWhileIdleIsOnlyRecorded(reason: String) {
        let state = makeState(bluetooth: .unknown, phase: .idle)

        assert(state, .bluetoothChanged(.unavailable(reason: reason))) {
            $0.bluetooth = .unavailable(reason: reason)
        }
        assert(state, .bluetoothChanged(.unavailable(reason: reason)), delivers: nil)
    }

    @Test(arguments: ["not allowed", "off", "unsupported"])
    func bluetoothLostWhileScanningStopsScanAndDropsChoice(reason: String) {
        let state = makeState(selection: .host(till), phase: .scanning, signal: .live(dBm: -58))

        assert(state, .bluetoothChanged(.unavailable(reason: reason))) {
            $0.bluetooth = .unavailable(reason: reason)
            $0.selection = .none
            $0.signal = .none
            $0.phase = .stoppingScan(nil)
        }
        assert(state, .bluetoothChanged(.unavailable(reason: reason)), delivers: .stopScanning)
    }

    @Test func bluetoothAvailableAgainWhileScanningChangesNothing() {
        let state = makeState(selection: .host(till), phase: .scanning)

        assert(state, .bluetoothChanged(.available))
        assert(state, .bluetoothChanged(.available), delivers: nil)
    }

    @Test func bluetoothLostWhileScanStartsWaitsForTheStart() {
        let state = makeState(phase: .startingScan, signal: .live(dBm: -70))

        assert(state, .bluetoothChanged(off)) { $0.bluetooth = off }
        assert(state, .bluetoothChanged(off), delivers: nil)
    }

    @Test func bluetoothBackWhileScanStopsWaitsForTheStop() {
        let state = makeState(bluetooth: off, phase: .stoppingScan(nil))

        assert(state, .bluetoothChanged(.available)) { $0.bluetooth = .available }
        assert(state, .bluetoothChanged(.available), delivers: nil)
    }

    @Test(arguments: [ClientFind.Phase.stoppingScan(till), .handedOver(till)])
    func bluetoothLostDuringHandoverIsOnlyRecorded(phase: ClientFind.Phase) {
        let state = makeState(selection: .host(till), phase: phase, signal: .atStart(dBm: -58))

        assert(state, .bluetoothChanged(off)) { $0.bluetooth = off }
        assert(state, .bluetoothChanged(off), delivers: nil)
    }

    // MARK: - Scanner results

    @Test func scanStartedWithBluetoothScans() {
        let state = makeState(phase: .startingScan)

        assert(state, .scanningStarted) { $0.phase = .scanning }
        assert(state, .scanningStarted, delivers: nil)
    }

    @Test func scanStartedAfterBluetoothWasLostStopsIt() {
        let state = makeState(bluetooth: off, phase: .startingScan, signal: .live(dBm: -58))

        assert(state, .scanningStarted) {
            $0.signal = .none
            $0.phase = .stoppingScan(nil)
        }
        assert(state, .scanningStarted, delivers: .stopScanning)
    }

    @Test(arguments: [
        ClientFind.Phase.idle, .scanning, .stoppingScan(till), .stoppingScan(nil), .handedOver(till),
    ])
    func scanStartedOutsideStartingIsIgnored(phase: ClientFind.Phase) {
        let state = makeState(selection: .host(till), phase: phase)

        assert(state, .scanningStarted)
        assert(state, .scanningStarted, delivers: nil)
    }

    @Test func scanStoppedForAHostHandsItOver() {
        let state = makeState(selection: .host(till), phase: .stoppingScan(till), signal: .atStart(dBm: -58))

        assert(state, .scanningStopped) { $0.phase = .handedOver(till) }
        assert(state, .scanningStopped, delivers: nil)
    }

    @Test func scanStoppedWithBluetoothBackScansAgain() {
        let state = makeState(phase: .stoppingScan(nil))

        assert(state, .scanningStopped) { $0.phase = .startingScan }
        assert(state, .scanningStopped, delivers: .startScanning)
    }

    @Test func scanStoppedWithoutBluetoothGoesIdle() {
        let state = makeState(bluetooth: off, phase: .stoppingScan(nil))

        assert(state, .scanningStopped) { $0.phase = .idle }
        assert(state, .scanningStopped, delivers: nil)
    }

    @Test(arguments: [ClientFind.Phase.idle, .startingScan, .scanning, .handedOver(till)])
    func scanStoppedOutsideStoppingIsIgnored(phase: ClientFind.Phase) {
        let state = makeState(selection: .host(till), phase: phase)

        assert(state, .scanningStopped)
        assert(state, .scanningStopped, delivers: nil)
    }

    // MARK: - Picker

    @Test(arguments: [
        (ClientFind.Selection.none, till), (.none, unnamed), (.host(till), other),
        (.host(unnamed), till), (.holdCloser, till), (.gone, till),
    ])
    func offeredHostBecomesTheChoice(before: ClientFind.Selection, host: ClientFind.Host) {
        let state = makeState(selection: before, phase: .scanning)

        assert(state, .pickerAnswered(.host(host))) { $0.selection = .host(host) }
        assert(state, .pickerAnswered(.host(host)), delivers: nil)
    }

    @Test(arguments: [ClientFind.Selection.none, .host(till), .holdCloser])
    func noClearNearestHostAsksToHoldCloser(before: ClientFind.Selection) {
        let state = makeState(selection: before, phase: .scanning)

        assert(state, .pickerAnswered(.holdCloser)) { $0.selection = .holdCloser }
        assert(state, .pickerAnswered(.holdCloser), delivers: nil)
    }

    @Test(arguments: [ClientFind.Answer.holdCloser, .none])
    func goneHostStaysGoneUntilAHostIsOffered(answer: ClientFind.Answer) {
        let state = makeState(selection: .gone, phase: .scanning)

        assert(state, .pickerAnswered(answer))
        assert(state, .pickerAnswered(answer), delivers: nil)
    }

    @Test func chosenHostGoingQuietIsGone() {
        let state = makeState(selection: .host(till), phase: .scanning)

        assert(state, .pickerAnswered(.none)) { $0.selection = .gone }
        assert(state, .pickerAnswered(.none), delivers: nil)
    }

    @Test(arguments: [ClientFind.Selection.none, .holdCloser])
    func noHostNearbyLeavesNoChoice(before: ClientFind.Selection) {
        let state = makeState(selection: before, phase: .scanning)

        assert(state, .pickerAnswered(.none)) { $0.selection = .none }
        assert(state, .pickerAnswered(.none), delivers: nil)
    }

    @Test(arguments: [
        ClientFind.Phase.idle, .startingScan, .stoppingScan(till), .stoppingScan(nil), .handedOver(till),
    ])
    func pickerAnswersOutsideScanningAreIgnored(phase: ClientFind.Phase) {
        let state = makeState(selection: .host(till), phase: phase)

        assert(state, .pickerAnswered(.host(other)))
        assert(state, .pickerAnswered(.host(other)), delivers: nil)
    }

    // MARK: - Start

    @Test(arguments: [till, unnamed])
    func startWithAChosenHostStopsScanningForHandover(host: ClientFind.Host) {
        let state = makeState(selection: .host(host), phase: .scanning, signal: .live(dBm: -58))

        assert(state, .start) {
            $0.signal = .atStart(dBm: -58)
            $0.phase = .stoppingScan(host)
        }
        assert(state, .start, delivers: .stopScanning)
    }

    @Test func startWithNoSignalKeepsNone() {
        let state = makeState(selection: .host(till), phase: .scanning)

        assert(state, .start) { $0.phase = .stoppingScan(till) }
        assert(state, .start, delivers: .stopScanning)
    }

    @Test(arguments: [ClientFind.Selection.none, .holdCloser, .gone])
    func startWithoutAChosenHostIsIgnored(selection: ClientFind.Selection) {
        let state = makeState(selection: selection, phase: .scanning)

        assert(state, .start)
        assert(state, .start, delivers: nil)
    }

    @Test(arguments: [
        ClientFind.Phase.idle, .startingScan, .stoppingScan(till), .stoppingScan(nil), .handedOver(till),
    ])
    func startOutsideScanningIsIgnored(phase: ClientFind.Phase) {
        let state = makeState(selection: .host(till), phase: phase)

        assert(state, .start)
        assert(state, .start, delivers: nil)
    }

    @Test func startWithoutBluetoothIsIgnored() {
        let state = makeState(bluetooth: off, selection: .host(till), phase: .scanning)

        assert(state, .start)
        assert(state, .start, delivers: nil)
    }

    // MARK: - Transaction end

    @Test func transactionEndScansAgainFromNoChoice() {
        let state = makeState(selection: .host(till), phase: .handedOver(till), signal: .atStart(dBm: -58))

        assert(state, .transactionEnded) {
            $0.selection = .none
            $0.signal = .none
            $0.phase = .startingScan
        }
        assert(state, .transactionEnded, delivers: .startScanning)
    }

    @Test func transactionEndWithoutBluetoothGoesIdle() {
        let state = makeState(
            bluetooth: off, selection: .host(till), phase: .handedOver(till), signal: .atStart(dBm: -58)
        )

        assert(state, .transactionEnded) {
            $0.selection = .none
            $0.signal = .none
            $0.phase = .idle
        }
        assert(state, .transactionEnded, delivers: nil)
    }

    @Test(arguments: [
        ClientFind.Phase.idle, .startingScan, .scanning, .stoppingScan(till), .stoppingScan(nil),
    ])
    func transactionEndBeforeHandoverIsIgnored(phase: ClientFind.Phase) {
        let state = makeState(selection: .host(till), phase: phase)

        assert(state, .transactionEnded)
        assert(state, .transactionEnded, delivers: nil)
    }
}

// MARK: - Helpers

private func makeState(
    bluetooth: ClientFind.Bluetooth = .available,
    selection: ClientFind.Selection = .none,
    phase: ClientFind.Phase = .scanning,
    signal: ClientFind.Signal = .none
) -> State {
    State(bluetooth: bluetooth, selection: selection, phase: phase, signal: signal)
}

private func assert(
    _ state: State,
    _ event: Event,
    sourceLocation: SourceLocation = #_sourceLocation,
    _ update: (inout State) -> Void = { _ in }
) {
    var expected = state
    update(&expected)
    #expect(ClientFind.reduce(state, event).0 == expected, sourceLocation: sourceLocation)
}

private func assert(
    _ state: State,
    _ event: Event,
    delivers effect: Effect?,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    #expect(ClientFind.reduce(state, event).1 == effect, sourceLocation: sourceLocation)
}
