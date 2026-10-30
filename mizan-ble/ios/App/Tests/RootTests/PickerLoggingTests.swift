import Foundation
import Testing
import ClientFind
import Settings
@testable import Root

@Suite @MainActor struct PickerLoggingTests {
    @Test func scanningLogNamesOnlyTheSelection() {
        let secret = SecretsGate()
        let host = ClientFind.Host(id: secret.peer.uuidString, name: secret.amount)
        var state = ClientFind.State()
        state = ClientFind.reduce(state, .bluetoothChanged(.available)).0
        #expect(state.logDescription == "startingScan")
        state = ClientFind.reduce(state, .scanningStarted).0
        #expect(state.logDescription == "scanning none")
        var entries: [LogEntry] = []
        for (answer, description): (ClientFind.Answer, String) in [
            (.holdCloser, "holdCloser"), (.host(host), "host"), (.none, "gone"),
        ] {
            state = ClientFind.reduce(state, .pickerAnswered(answer)).0
            #expect(state.logDescription == "scanning \(description)")
            entries.append(.init(category: .clientFind, message: state.logDescription))
        }
        secret.assertAbsent(from: entries)
    }

    @Test func pickerLogsStartOnceAndStartsFreshAfterStop() {
        let h = Harness()
        defer { h.finish() }
        let discovery = makeDiscovery(h)
        defer { discovery.stop() }
        discovery.start()
        discovery.start()
        #expect(messages(h) == ["picker none hosts=0"])
        discovery.reading(host: SecretsGate().peer, name: "private", rssi: -71, time: 0)
        discovery.stop()
        discovery.stop()
        discovery.start()
        #expect(messages(h) == ["picker none hosts=0", "picker holdCloser rssi=-71 hosts=1", "picker none hosts=0"])
    }

    @Test func pickerLogsAnswerChangesOnReadingsAndTicks() async {
        let h = Harness()
        defer { h.finish() }
        h.store.set(.number(1), for: .pickerWindowReadings)
        let discovery = makeDiscovery(h)
        defer { discovery.stop() }
        let (events, sink) = AsyncStream<ClientFind.Event>.makeStream()
        defer { sink.finish() }
        discovery.send = { sink.yield($0) }
        var answers = events.makeAsyncIterator()
        discovery.start()
        let secret = SecretsGate()
        discovery.reading(host: secret.peer, name: secret.amount, rssi: -50, time: 0)
        #expect(await answers.next() == .pickerAnswered(.holdCloser))
        h.clock.advance(1)
        #expect(await answers.next() == .pickerAnswered(.host(.init(id: secret.peer.uuidString, name: secret.amount))))
        h.clock.advance(1)
        #expect(await answers.next() == .pickerAnswered(.none))
        #expect(messages(h) == ["picker none hosts=0", "picker holdCloser rssi=-50 hosts=1", "picker host rssi=-50 hosts=1", "picker none hosts=0"])
        secret.assertAbsent(from: h.log.entries)
    }

    @Test func pickerLogsOnlyThreeDBMovesFromLastWrittenRoundedAverage() {
        for (readings, expected): ([Int], [String]) in [
            ([-70, -66, -66, -69, -74, -75, -75], ["-70", "-67", "-71", "-74"]),
            ([-70, -65, -66], ["-70", "-67"]),
        ] {
            let h = Harness()
            defer { h.finish() }
            h.store.set(.number(0.5), for: .pickerAlpha)
            let discovery = makeDiscovery(h)
            defer { discovery.stop() }
            discovery.start()
            for (time, reading) in readings.enumerated() {
                discovery.reading(host: SecretsGate().peer, name: "private", rssi: reading, time: Double(time))
            }
            discovery.reading(host: SecretsGate().session, name: "other private", rssi: -90, time: Double(readings.count))
            #expect(messages(h) == ["picker none hosts=0"] + expected.map { "picker holdCloser rssi=\($0) hosts=1" })
        }
    }

    @Test func pickerSuppressesThreeDBMovesWithinOneSecond() {
        let h = Harness()
        defer { h.finish() }
        h.store.set(.number(1), for: .pickerAlpha)
        let discovery = makeDiscovery(h)
        defer { discovery.stop() }
        discovery.start()
        for (rssi, time): (Int, Double) in [(-70, 0), (-67, 0.1), (-80, 0.5), (-66, 0.999)] {
            discovery.reading(host: SecretsGate().peer, name: "private", rssi: rssi, time: time)
        }
        #expect(messages(h) == ["picker none hosts=0", "picker holdCloser rssi=-70 hosts=1"])
    }

    @Test(arguments: [1.0, 1.25])
    func pickerLogsHeldMoveOnReadingAtOrAfterOneSecond(time: Double) {
        let h = Harness()
        defer { h.finish() }
        h.store.set(.number(1), for: .pickerAlpha)
        let discovery = makeDiscovery(h)
        defer { discovery.stop() }
        discovery.start()
        discovery.reading(host: SecretsGate().peer, name: "private", rssi: -70, time: 0)
        discovery.reading(host: SecretsGate().peer, name: nil, rssi: -67, time: 0.25)
        #expect(messages(h) == ["picker none hosts=0", "picker holdCloser rssi=-70 hosts=1"])
        discovery.reading(host: SecretsGate().peer, name: nil, rssi: -67, time: time)
        #expect(messages(h) == ["picker none hosts=0", "picker holdCloser rssi=-70 hosts=1", "picker holdCloser rssi=-67 hosts=1"])
        var expected = ["picker none hosts=0", "picker holdCloser rssi=-70 hosts=1", "picker holdCloser rssi=-67 hosts=1"]
        for (interval, rssi) in [-70, -67, -70].enumerated() {
            let lastLineTime = time + Double(interval)
            for offset in [0.1, 0.999] {
                discovery.reading(host: SecretsGate().peer, name: nil, rssi: rssi, time: lastLineTime + offset)
                #expect(messages(h) == expected)
            }
            discovery.reading(host: SecretsGate().peer, name: nil, rssi: rssi, time: lastLineTime + 1)
            expected.append("picker holdCloser rssi=\(rssi) hosts=1")
            #expect(messages(h) == expected)
        }
    }

    @Test(arguments: [1, 2])
    func pickerLogsHeldMoveOnTickAtOrAfterOneSecond(seconds: Int) async {
        let h = Harness()
        defer { h.finish() }
        h.store.set(.number(1), for: .pickerAlpha)
        let discovery = makeDiscovery(h)
        defer { discovery.stop() }
        discovery.start()
        discovery.reading(host: SecretsGate().peer, name: "private", rssi: -70, time: 0)
        discovery.reading(host: SecretsGate().peer, name: nil, rssi: -67, time: 0.25)
        #expect(messages(h) == ["picker none hosts=0", "picker holdCloser rssi=-70 hosts=1"])
        let (events, sink) = AsyncStream<ClientFind.Event>.makeStream()
        defer { sink.finish() }
        discovery.send = { sink.yield($0) }
        var answers = events.makeAsyncIterator()
        h.clock.advance(seconds)
        #expect(await answers.next() == .pickerAnswered(.holdCloser))
        #expect(messages(h) == ["picker none hosts=0", "picker holdCloser rssi=-70 hosts=1", "picker holdCloser rssi=-67 hosts=1"])
        var expected = ["picker none hosts=0", "picker holdCloser rssi=-70 hosts=1", "picker holdCloser rssi=-67 hosts=1"]
        for rssi in [-70, -67, -70] {
            let lastLineTime = h.clock.now()
            for offset in [0.1, 0.999] {
                discovery.reading(host: SecretsGate().peer, name: nil, rssi: rssi, time: lastLineTime + offset)
                #expect(await answers.next() == .pickerAnswered(.holdCloser))
                #expect(messages(h) == expected)
            }
            h.clock.advance(1)
            #expect(await answers.next() == .pickerAnswered(.holdCloser))
            expected.append("picker holdCloser rssi=\(rssi) hosts=1")
            #expect(messages(h) == expected)
        }
    }

    @Test func pickerLogsAnswerAndHostChangesWithinOneSecond() {
        let h = Harness()
        defer { h.finish() }
        h.store.set(.number(1), for: .pickerWindowReadings)
        h.store.set(.number(0.5), for: .pickerWindowSeconds)
        h.store.set(.number(1), for: .pickerAlpha)
        h.store.set(.number(0), for: .pickerMargin)
        let discovery = makeDiscovery(h)
        defer { discovery.stop() }
        let secret = SecretsGate()
        discovery.start()
        discovery.reading(host: secret.peer, name: "private", rssi: -50, time: 0)
        discovery.reading(host: secret.session, name: "other private", rssi: -51, time: 0)
        discovery.reading(host: secret.peer, name: nil, rssi: -50, time: 0.5)
        discovery.reading(host: secret.session, name: nil, rssi: -49, time: 0.5)
        #expect(messages(h) == ["picker none hosts=0", "picker holdCloser rssi=-50 hosts=1", "picker host rssi=-50 hosts=2", "picker host rssi=-49 hosts=2"])
    }

    @Test func pickerAnswerChangeResetsOneSecondInterval() {
        let h = Harness()
        defer { h.finish() }
        h.store.set(.number(1), for: .pickerWindowReadings)
        h.store.set(.number(0.5), for: .pickerWindowSeconds)
        h.store.set(.number(1), for: .pickerAlpha)
        let discovery = makeDiscovery(h)
        defer { discovery.stop() }
        discovery.start()
        discovery.reading(host: SecretsGate().peer, name: "private", rssi: -50, time: 0)
        discovery.reading(host: SecretsGate().peer, name: nil, rssi: -50, time: 0.5)
        discovery.reading(host: SecretsGate().peer, name: nil, rssi: -53, time: 1)
        #expect(messages(h) == ["picker none hosts=0", "picker holdCloser rssi=-50 hosts=1", "picker host rssi=-50 hosts=1"])
        discovery.reading(host: SecretsGate().peer, name: nil, rssi: -53, time: 1.5)
        #expect(messages(h) == ["picker none hosts=0", "picker holdCloser rssi=-50 hosts=1", "picker host rssi=-50 hosts=1", "picker host rssi=-53 hosts=1"])
    }

    @Test func pickerLogsChangedHostBelowTheSignalThreshold() {
        let h = Harness()
        defer { h.finish() }
        h.store.set(.number(1), for: .pickerWindowReadings)
        h.store.set(.number(1), for: .pickerAlpha)
        h.store.set(.number(0), for: .pickerMargin)
        let discovery = makeDiscovery(h)
        defer { discovery.stop() }
        let secret = SecretsGate()
        discovery.start()
        discovery.reading(host: secret.peer, name: secret.amount, rssi: -50, time: 0)
        discovery.reading(host: secret.session, name: secret.amountMinorUnits, rssi: -51, time: 0)
        discovery.reading(host: secret.peer, name: nil, rssi: -50, time: 1)
        discovery.reading(host: secret.session, name: nil, rssi: -49, time: 1)
        #expect(messages(h) == ["picker none hosts=0", "picker holdCloser rssi=-50 hosts=1", "picker host rssi=-50 hosts=2", "picker host rssi=-49 hosts=2"])
        secret.assertAbsent(from: h.log.entries)
    }

    @Test func stoppedPickerLogsNoReadings() {
        let h = Harness()
        defer { h.finish() }
        let discovery = makeDiscovery(h)
        discovery.start()
        discovery.reading(host: SecretsGate().peer, name: "private", rssi: -71, time: 0)
        discovery.stop()
        discovery.reading(host: SecretsGate().peer, name: "private", rssi: -40, time: 3)
        h.clock.advance(3)
        #expect(messages(h) == ["picker none hosts=0", "picker holdCloser rssi=-71 hosts=1"])
    }
}

@MainActor private func makeDiscovery(_ h: Harness) -> ClientDiscovery {
    ClientDiscovery(radio: h.client, clock: h.clock, settings: Settings(store: h.store), log: h.log)
}

@MainActor private func messages(_ h: Harness) -> [String] {
    h.log.entries.filter { $0.category == .clientFind }.map(\.message)
}
