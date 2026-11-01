import Foundation
import Testing
@testable import Root

@Suite @MainActor struct RadioLoggingTests {
    @Test func hostCallsEventsAndSecrets() async throws {
        let h = Harness()
        defer { h.finish() }
        let s = SecretsGate()
        let radio = LoggedHostRadio(h.host, log: h.log)
        await radio.serve(s.key + s.nonce, for: s.session)
        radio.advertise(s.amount, for: s.session)
        radio.stopAdvertising(for: s.session)
        radio.retire(s.session)
        radio.finish(s.session)
        try radio.send(s.frame, for: s.session)
        let failure = HostRadioFailure.system(domain: s.peer.uuidString, code: 987654321, message: s.amount)
        h.host.failure = failure
        #expect(throws: failure) { try radio.send(s.key, for: s.session) }
        #expect(h.host.calls == [
            .serve(s.key + s.nonce, s.session), .advertise(s.amount, s.session), .stop(s.session),
            .retire(s.session), .finish(s.session), .send(s.frame, s.session), .send(s.key, s.session),
        ])
        let states: [HostBluetoothState] = [.unknown, .resetting, .unsupported, .unauthorized, .poweredOff, .poweredOn]
        let events: [HostRadioEvent] = states.map { .bluetoothState($0) } + [
            .onAir(session: s.session), .couldNotGoOnAir(session: s.session, failure),
            .couldNotGoOnAir(session: s.session, .messageTooLarge(maximum: 12, actual: 32)),
            .clientKey(session: s.session, peer: s.peer, bytes: s.key),
            .decision(session: s.session, bytes: s.frame), .clientLost(session: s.session),
        ]
        for event in events { h.host.continuation.yield(event) }
        h.host.continuation.finish()
        var received: [HostRadioEvent] = []
        for await event in radio.events { received.append(event) }
        #expect(received == events)
        let expected = ["built", "serve called bytes=44", "serve succeeded", "advertise called", "advertise succeeded",
            "stopAdvertising called", "stopAdvertising succeeded", "retire called", "retire succeeded",
            "finish called", "finish succeeded", "send called bytes=32", "send succeeded", "send called bytes=32", "send failed"]
            + ["unknown", "resetting", "unsupported", "unauthorized", "poweredOff", "poweredOn"].map { "bluetoothState \($0)" }
            + ["onAir", "couldNotGoOnAir system", "couldNotGoOnAir messageTooLarge maximum=12 actual=32",
               "clientKey bytes=32", "decision bytes=32", "clientLost"]
        #expect(h.log.entries.map(\.message) == expected)
        #expect(h.log.entries.allSatisfy { $0.category == .hostRadio })
        #expect(h.log.entries.compactMap(\.error) == ["system"])
        s.assertAbsent(from: h.log.entries)
    }

    @Test func clientCallsEventsAndSecrets() async {
        let h = Harness()
        defer { h.finish() }
        let s = SecretsGate()
        let radio = LoggedClientRadio(h.client, log: h.log)
        radio.startScanning()
        radio.stopScanning()
        radio.connect(to: s.peer)
        radio.writeKey(s.key)
        let success = await radio.write(s.nonce + s.frame)
        if case .failure = success { Issue.record("Write success was changed") }
        h.client.result = .failure(.transport(code: 987654321))
        let failed = await radio.write(Array(s.amount.utf8))
        if case .failure(.transport(code: 987654321)) = failed {} else { Issue.record("Write failure was changed") }
        radio.drop()
        #expect(h.client.calls == [.start, .stop, .connect(s.peer), .key(s.key), .write(s.nonce + s.frame), .write(Array(s.amount.utf8)), .drop])
        let states: [ClientBluetoothState] = [.unknown, .resetting, .unsupported, .notAllowed, .off, .on]
        let failures: [ClientRadioFailure] = [.noService, .missingCharacteristic, .notificationsDisabled, .unavailableHost,
            .notConnected, .tooLarge(maximum: 12), .att(code: 987654321), .transport(code: 987654321), .disconnected]
            + states.map { .bluetooth($0) }
        let failureLines = ["noService", "missingCharacteristic", "notificationsDisabled", "unavailableHost", "notConnected",
            "tooLarge maximum=12", "att", "transport", "disconnected"]
            + ["unknown", "resetting", "unsupported", "notAllowed", "off", "on"].map { "bluetooth \($0)" }
        let events: [ClientRadioEvent] = states.map { .bluetooth($0) } + [
            .reading(host: s.peer, name: s.amount, rssi: -42, time: 987654321),
            .connected(host: s.peer, session: s.key + s.nonce, largestWrite: 512),
            .message(host: s.peer, bytes: s.frame), .dropped(host: s.peer),
            .writeAnswered(.key, nil), .writeAnswered(.message, nil),
        ] + failures.flatMap { [.couldNotConnect(host: s.peer, reason: $0), .writeAnswered(.key, $0), .writeAnswered(.message, $0)] }
        for event in events { h.client.continuation.yield(event) }
        h.client.continuation.finish()
        var received: [ClientRadioEvent] = []
        for await event in radio.events { received.append(event) }
        #expect(received == events)
        let expected = ["built", "startScanning called", "startScanning succeeded", "stopScanning called", "stopScanning succeeded",
            "connect called", "connect succeeded", "writeKey called bytes=32", "writeKey succeeded", "write called bytes=44",
            "write succeeded", "write called bytes=12", "write failed", "drop called", "drop succeeded"]
            + ["unknown", "resetting", "unsupported", "notAllowed", "off", "on"].map { "bluetooth \($0)" }
            + ["connected bytes=44 largestWrite=512", "message bytes=32", "dropped", "writeAnswered key succeeded", "writeAnswered message succeeded"]
            + failureLines.flatMap { ["couldNotConnect \($0)", "writeAnswered key \($0)", "writeAnswered message \($0)"] }
        #expect(h.log.entries.map(\.message) == expected)
        #expect(h.log.entries.allSatisfy { $0.category == .clientRadio })
        #expect(h.log.entries.compactMap(\.error) == ["transport"])
        s.assertAbsent(from: h.log.entries)
    }
}
