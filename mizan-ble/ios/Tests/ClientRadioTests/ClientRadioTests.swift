import Foundation
import Testing
@testable import ClientRadio

@MainActor struct ClientRadioTests {
    @Test func bluetoothStatesAreOrdered() async {
        let states: [ClientRadio.BluetoothState] = [.unknown, .resetting, .unsupported, .notAllowed, .off, .on]
        let events = await record { _, fake in
            for state in states { fake.send(.bluetooth(state)) }
        }
        #expect(events == states.map { .bluetooth($0) })
    }

    @Test func readingsAndIdempotentScanning() async {
        var expected: [ClientRadio.Event] = []
        let events = await record { radio, fake in
            radio.stopScanning()
            fake.send(.discovery(fake.host, name: "ignored", rssi: -10))
            radio.startScanning()
            radio.startScanning()
            #expect(fake.calls == [.scan(GATT.service, true)])
            for (index, rssi) in [-50, -52, -51].enumerated() {
                fake.time = Double(index) + 0.25
                let name: String? = index == 0 ? nil : "MIZAN-1234"
                fake.send(.discovery(fake.host, name: name, rssi: rssi))
                expected.append(.reading(host: fake.host, name: name, rssi: rssi, time: fake.time))
            }
            radio.stopScanning()
            radio.stopScanning()
            fake.send(.discovery(fake.host, name: nil, rssi: -99))
            radio.startScanning()
            radio.stopScanning()
            #expect(fake.calls == [.scan(GATT.service, true), .stop, .scan(GATT.service, true), .stop])
        }
        #expect(events == expected)
    }

    @Test func connectsThroughWholeGATTSetup() async {
        var expected: [ClientRadio.Event] = []
        let events = await record { radio, fake in
            let host = fake.host
            radio.connect(to: host)
            #expect(fake.calls == [.connect(host)])
            fake.send(.connected(host))
            #expect(fake.calls.last == .services(host))
            fake.send(.services(host, .success(true)))
            #expect(fake.calls.last == .characteristics(host))
            fake.send(.characteristics(host, .success(Set(Characteristic.allCases))))
            #expect(fake.calls.last == .subscribe(host))
            fake.send(.subscribed(host, .success(true)))
            #expect(fake.calls.last == .read(host))
            fake.send(.value(host, .session, .success([0, 255, 17])))
            #expect(fake.calls.last == .maximum(host))
            expected = [.connected(host: host, session: [0, 255, 17], largestWrite: 182)]
        }
        #expect(events == expected)
    }

    @Test func requestedScanRestartsWhenBluetoothTurnsOn() async {
        let events = await record { radio, fake in
            fake.send(.bluetooth(.unknown))
            radio.startScanning()
            radio.startScanning()
            #expect(fake.calls == [.scan(GATT.service, true)])
            fake.send(.bluetooth(.on))
            #expect(fake.calls == [.scan(GATT.service, true), .scan(GATT.service, true)])
            fake.send(.bluetooth(.off))
            fake.send(.bluetooth(.on))
            fake.send(.bluetooth(.on))
            #expect(fake.calls == Array(repeating: .scan(GATT.service, true), count: 4))
            radio.stopScanning()
            let calls = fake.calls
            fake.send(.bluetooth(.on))
            #expect(fake.calls == calls)
        }
        #expect(events == [.bluetooth(.unknown), .bluetooth(.on), .bluetooth(.off),
                           .bluetooth(.on), .bluetooth(.on), .bluetooth(.on)])
    }

    @Test(arguments: 0...5) func replacingHostTearsDownPreviousLink(stage: Int) async {
        var expected: [ClientRadio.Event] = []
        let events = await record { radio, fake in
            let first = fake.host
            let second = UUID()
            let steps: [RadioCallback] = [
                .connected(first), .services(first, .success(true)),
                .characteristics(first, .success(Set(Characteristic.allCases))),
                .subscribed(first, .success(true)), .value(first, .session, .success([1, 2, 3])),
            ]
            radio.connect(to: first)
            for step in steps.prefix(stage) { fake.send(step) }
            if stage == 5 {
                expected.append(.connected(host: first, session: [1, 2, 3], largestWrite: 182))
                radio.writeKey([1])
            }
            let oldWrite = stage == 5 ? Task.immediate { await radio.write([2]) } : nil
            fake.calls = []
            radio.connect(to: second)
            #expect(fake.calls == [.disconnect(first), .connect(second)])
            for step in steps { fake.send(step) }
            fake.send(.written(first, .key, nil))
            fake.send(.written(first, .toHost, nil))
            fake.send(.disconnected(first))
            #expect(fake.calls == [.disconnect(first), .connect(second)])
            fake.send(.connected(second))
            fake.send(.services(second, .success(true)))
            fake.send(.characteristics(second, .success(Set(Characteristic.allCases))))
            fake.send(.subscribed(second, .success(true)))
            fake.send(.value(second, .session, .success([4, 5, 6])))
            let newWrite = Task.immediate { await radio.write([3]) }
            fake.send(.written(second, .toHost, .att(code: 7)))
            fake.send(.written(second, .toHost, nil))
            fake.send(.written(second, .key, nil))
            if let oldWrite {
                #expect(await oldWrite.value.map { true } == .failure(.disconnected))
            }
            #expect(await newWrite.value.map { true } == .failure(.att(code: 7)))
            expected.append(.dropped(host: first))
            if stage == 5 {
                expected += [.writeAnswered(.key, .disconnected), .writeAnswered(.message, .disconnected)]
            }
            expected += [.connected(host: second, session: [4, 5, 6], largestWrite: 182),
                         .writeAnswered(.message, .att(code: 7))]
        }
        #expect(events == expected)
    }

    @Test(arguments: 0...4) func setupRejectsWritesAndOutOfStageCallbacks(stage: Int) async {
        let events = await record { radio, fake in
            let host = fake.host
            let error: ClientRadio.Failure = .att(code: 5)
            let steps: [RadioCallback] = [
                .connected(host), .services(host, .success(true)),
                .characteristics(host, .success(Set(Characteristic.allCases))),
                .subscribed(host, .success(true)), .value(host, .session, .success([1])),
            ]
            let callbacksByStage: [[RadioCallback]] = [
                [.connected(host), .connectionFailed(host, error)],
                [.services(host, .success(true)), .services(host, .success(false)), .services(host, .failure(error))],
                [.characteristics(host, .success(Set(Characteristic.allCases))),
                 .characteristics(host, .success([])), .characteristics(host, .failure(error))],
                [.subscribed(host, .success(true)), .subscribed(host, .success(false)),
                 .subscribed(host, .failure(error))],
                [.value(host, .session, .success([1])), .value(host, .session, .failure(error))],
            ]
            radio.connect(to: host)
            for step in steps.prefix(stage) { fake.send(step) }
            fake.calls = []
            radio.writeKey([1])
            #expect(await radio.write([2]).map { true } == .failure(.notConnected))
            #expect(fake.calls.isEmpty)
            for (index, callbacks) in callbacksByStage.enumerated() where index != stage {
                for callback in callbacks {
                    fake.send(callback)
                    fake.send(callback)
                    #expect(fake.calls.isEmpty)
                }
            }
            for characteristic in Characteristic.allCases {
                fake.send(.written(host, characteristic, nil))
                fake.send(.written(host, characteristic, error))
                if characteristic != .session {
                    fake.send(.value(host, characteristic, .success([99])))
                    fake.send(.value(host, characteristic, .failure(error)))
                }
            }
            #expect(fake.calls.isEmpty)
        }
        #expect(events == [.writeAnswered(.key, .notConnected), .writeAnswered(.message, .notConnected)])
    }

    @Test func setupFailuresKeepTheirReasons() async {
        for stage in 0...4 {
            for missing in [false, true] {
                var expected: [ClientRadio.Event] = []
                let events = await record { radio, fake in
                    let host = fake.host
                    radio.connect(to: host)
                    let success: [RadioCallback] = [
                        .connected(host), .services(host, .success(true)),
                        .characteristics(host, .success(Set(Characteristic.allCases))),
                        .subscribed(host, .success(true)), .value(host, .session, .success([1])),
                    ]
                    for callback in success.prefix(stage) { fake.send(callback) }
                    let error: ClientRadio.Failure = .transport(code: 73)
                    let failure: RadioCallback
                    let reason: ClientRadio.Failure
                    switch stage {
                    case 0: failure = .connectionFailed(host, error); reason = error
                    case 1:
                        failure = .services(host, missing ? .success(false) : .failure(error))
                        reason = missing ? .noService : error
                    case 2:
                        failure = .characteristics(host, missing ? .success([]) : .failure(error))
                        reason = missing ? .missingCharacteristic : error
                    case 3:
                        failure = .subscribed(host, missing ? .success(false) : .failure(error))
                        reason = missing ? .notificationsDisabled : error
                    default:
                        failure = .value(host, .session, .failure(.att(code: 5)))
                        reason = .att(code: 5)
                    }
                    fake.send(failure)
                    #expect(fake.calls.last == .disconnect(host))
                    let calls = fake.calls
                    for callback in success { fake.send(callback) }
                    #expect(fake.calls == calls)
                    expected = [.couldNotConnect(host: host, reason: reason)]
                }
                #expect(events == expected)
            }
        }
    }

    @Test func writesReceiveResponsesAndATTErrors() async {
        let errors: [ClientRadio.Failure?] = [nil, .att(code: 3), .att(code: 14), .transport(code: 8)]
        for (index, error) in errors.enumerated() {
            var expected: [ClientRadio.Event] = []
            let events = await record { radio, fake in
                fake.establish(radio)
                let key = [UInt8](repeating: 9, count: 33)
                radio.writeKey(key)
                #expect(Array(fake.calls.suffix(2)) == [.maximum(fake.host), .write(key, .key, fake.host)])
                fake.send(.written(fake.host, .key, error))
                let messages: [[UInt8]] = [
                    [0, 255, 4], [], [UInt8](repeating: 5, count: 182), [UInt8](repeating: 5, count: 181),
                ]
                let message = messages[index]
                let write = Task.immediate { await radio.write(message) }
                #expect(Array(fake.calls.suffix(2)) == [.maximum(fake.host), .write(message, .toHost, fake.host)])
                fake.send(.written(fake.host, .toHost, error))
                let result = await write.value.map { true }
                #expect(result == (error.map { .failure($0) } ?? .success(true)))
                expected = [
                    .connected(host: fake.host, session: [1, 2, 3], largestWrite: 182),
                    .writeAnswered(.key, error), .writeAnswered(.message, error),
                ]
            }
            #expect(events == expected)
        }
    }

    @Test func oversizedWritesAreRejectedBeforeBindingWrite() async {
        for count in [21, 41, 183] {
            var expected: [ClientRadio.Event] = []
            let events = await record { radio, fake in
                fake.establish(radio)
                fake.largestWrite = 20
                fake.calls = []
                let bytes = [UInt8](repeating: 6, count: count)
                radio.writeKey(bytes)
                let write = Task.immediate { await radio.write(bytes) }
                #expect(fake.calls == [.maximum(fake.host), .maximum(fake.host)])
                fake.send(.written(fake.host, .key, nil))
                fake.send(.written(fake.host, .toHost, nil))
                #expect(await write.value.map { true } == .failure(.tooLarge(maximum: 20)))
                expected = [
                    .connected(host: fake.host, session: [1, 2, 3], largestWrite: 182),
                    .writeAnswered(.key, .tooLarge(maximum: 20)),
                    .writeAnswered(.message, .tooLarge(maximum: 20)),
                ]
            }
            #expect(events == expected)
        }
    }

    @Test func notificationsDeliverOnlyTheReadyHostsBytes() async {
        var expected: [ClientRadio.Event] = []
        let events = await record { radio, fake in
            fake.send(.value(fake.host, .toClient, .success([99])))
            fake.establish(radio)
            expected = [.connected(host: fake.host, session: [1, 2, 3], largestWrite: 182)]
            fake.send(.value(UUID(), .toClient, .success([99])))
            fake.send(.value(fake.host, .session, .success([99])))
            fake.send(.value(fake.host, .toClient, .failure(.att(code: 1))))
            for bytes in [[UInt8](repeating: 7, count: 41), [], [0, 255, 128]] {
                fake.send(.value(fake.host, .toClient, .success(bytes)))
                expected.append(.message(host: fake.host, bytes: bytes))
            }
        }
        #expect(events == expected)
    }

    @Test func linksDropAndRejectLateCallbacks() async {
        for cause in 0...2 {
            var expected: [ClientRadio.Event] = []
            let events = await record { radio, fake in
                fake.establish(radio)
                fake.calls = []
                fake.send(.disconnected(UUID()))
                fake.send(.serviceRemoved(UUID()))
                switch cause {
                case 0: fake.send(.disconnected(fake.host))
                case 1: fake.send(.serviceRemoved(fake.host))
                default: radio.drop()
                }
                #expect(fake.calls == [.disconnect(fake.host)])
                radio.drop()
                fake.send(.disconnected(fake.host))
                fake.send(.serviceRemoved(fake.host))
                fake.send(.connected(fake.host))
                fake.send(.value(fake.host, .toClient, .success([99])))
                #expect(fake.calls == [.disconnect(fake.host)])
                expected = [.connected(host: fake.host, session: [1, 2, 3], largestWrite: 182), .dropped(host: fake.host)]
            }
            #expect(events == expected)
        }
    }

    @Test func unrelatedCallbacksKeepTheSelectedLink() async {
        var expected: [ClientRadio.Event] = []
        let events = await record { radio, fake in
            fake.establish(radio)
            fake.calls = []
            let other = UUID()
            fake.send(.disconnected(other))
            fake.send(.serviceRemoved(other))
            fake.send(.connectionFailed(other, .transport(code: 3)))
            fake.send(.value(other, .toClient, .success([99])))
            fake.send(.value(fake.host, .toClient, .success([5])))
            #expect(fake.calls.isEmpty)
            expected = [
                .connected(host: fake.host, session: [1, 2, 3], largestWrite: 182),
                .message(host: fake.host, bytes: [5]),
            ]
        }
        #expect(events == expected)
    }

    @Test func bluetoothLossDropsTheLink() async {
        for state: ClientRadio.BluetoothState in [.unknown, .resetting, .unsupported, .notAllowed, .off] {
            var expected: [ClientRadio.Event] = []
            let events = await record { radio, fake in
                fake.establish(radio)
                fake.calls = []
                fake.send(.bluetooth(.on))
                #expect(fake.calls.isEmpty)
                fake.send(.bluetooth(state))
                #expect(fake.calls == [.disconnect(fake.host)])
                fake.send(.value(fake.host, .toClient, .success([99])))
                fake.send(.disconnected(fake.host))
                expected = [
                    .connected(host: fake.host, session: [1, 2, 3], largestWrite: 182),
                    .bluetooth(.on), .bluetooth(state), .dropped(host: fake.host),
                ]
            }
            #expect(events == expected)
        }
    }

    @Test func droppingCompletesPendingWritesBeforeReconnect() async {
        var expected: [ClientRadio.Event] = []
        let events = await record { radio, fake in
            fake.establish(radio)
            radio.writeKey([1])
            let oldWrite = Task.immediate { await radio.write([2]) }
            radio.drop()
            radio.writeKey([4])
            #expect(await radio.write([5]).map { true } == .failure(.notConnected))
            fake.establish(radio)
            let newWrite = Task.immediate { await radio.write([3]) }
            fake.send(.written(fake.host, .toHost, nil))
            fake.send(.written(fake.host, .toHost, nil))
            fake.send(.written(fake.host, .key, nil))
            #expect(await oldWrite.value.map { true } == .failure(.disconnected))
            #expect(await newWrite.value.map { true } == .success(true))
            expected = [
                .connected(host: fake.host, session: [1, 2, 3], largestWrite: 182),
                .dropped(host: fake.host), .writeAnswered(.key, .disconnected),
                .writeAnswered(.message, .disconnected),
                .writeAnswered(.key, .notConnected), .writeAnswered(.message, .notConnected),
                .connected(host: fake.host, session: [1, 2, 3], largestWrite: 182),
                .writeAnswered(.message, nil),
            ]
        }
        #expect(events == expected)
    }

    @Test func interruptedSetupReportsWhyItCouldNotConnect() async {
        for stage in 0...4 {
            for cause in 0...2 {
                var expected: [ClientRadio.Event] = []
                let events = await record { radio, fake in
                    let host = fake.host
                    radio.connect(to: host)
                    let steps: [RadioCallback] = [
                        .connected(host), .services(host, .success(true)),
                        .characteristics(host, .success(Set(Characteristic.allCases))),
                        .subscribed(host, .success(true)),
                    ]
                    for step in steps.prefix(stage) { fake.send(step) }
                    switch cause {
                    case 0: fake.send(.disconnected(host))
                    case 1: fake.send(.serviceRemoved(host))
                    default: fake.send(.bluetooth(.off))
                    }
                    #expect(fake.calls.last == .disconnect(host))
                    fake.send(.value(host, .session, .success([99])))
                    let reason: ClientRadio.Failure = cause == 2 ? .bluetooth(.off) : .disconnected
                    expected = [.couldNotConnect(host: host, reason: reason)]
                    if cause == 2 { expected.insert(.bluetooth(.off), at: 0) }
                }
                #expect(events == expected)
            }
        }
    }

    private func record(_ drive: (ClientRadio, FakeBinding) async -> Void) async -> [ClientRadio.Event] {
        let stream: AsyncStream<ClientRadio.Event>
        do {
            let fake = FakeBinding()
            let radio = ClientRadio(binding: fake, now: { fake.time })
            stream = radio.events
            await drive(radio, fake)
        }
        var events: [ClientRadio.Event] = []
        for await event in stream { events.append(event) }
        return events
    }
}

@MainActor private final class FakeBinding: RadioBinding {
    enum Call: Equatable {
        case scan(UUID, Bool), stop, connect(UUID), services(UUID), characteristics(UUID)
        case subscribe(UUID), read(UUID), maximum(UUID), write([UInt8], Characteristic, UUID), disconnect(UUID)
    }
    let host = UUID()
    var receive: ((RadioCallback) -> Void)?
    var calls: [Call] = []
    var time: Double = 0
    var largestWrite = 182
    func send(_ callback: RadioCallback) { receive?(callback) }
    func scan(service: UUID, allowDuplicates: Bool) { calls.append(.scan(service, allowDuplicates)) }
    func stopScan() { calls.append(.stop) }
    func connect(_ host: UUID) { calls.append(.connect(host)) }
    func discoverService(_ host: UUID) { calls.append(.services(host)) }
    func discoverCharacteristics(_ host: UUID) { calls.append(.characteristics(host)) }
    func subscribe(_ host: UUID) { calls.append(.subscribe(host)) }
    func readSession(_ host: UUID) { calls.append(.read(host)) }
    func maximumWrite(_ host: UUID) -> Int { calls.append(.maximum(host)); return largestWrite }
    func write(_ bytes: [UInt8], to characteristic: Characteristic, host: UUID) {
        calls.append(.write(bytes, characteristic, host))
    }
    func disconnect(_ host: UUID) { calls.append(.disconnect(host)) }
    func establish(_ radio: ClientRadio, session: [UInt8] = [1, 2, 3]) {
        radio.connect(to: host)
        send(.connected(host))
        send(.services(host, .success(true)))
        send(.characteristics(host, .success(Set(Characteristic.allCases))))
        send(.subscribed(host, .success(true)))
        send(.value(host, .session, .success(session)))
    }
}
