import Foundation
import Testing
import Root
import ScriptedSettings
import SessionCrypto
import MessageCodec
@testable import ScriptedRadio

@MainActor @Suite struct ScriptedRadioTests {
    @Test func amountIsSealedBeforeDeliveryLoss() async throws {
        var settings = Settings()
        settings.hosts[0].drop = .beforeAmountArrives
        settings.hosts[0].delays.amount = 100
        let f = await Fixture(settings)
        let (id, app) = try await f.connect()
        f.client.writeKey(app.publicKey)
        f.clock.advance(settings.hosts[0].delays.key)
        await f.collect()
        let sealed = try #require(f.protection.frames.first)
        #expect(try open(sealed, app) == .amount(settings.hosts[0].amount))
        #expect(f.ce.last == .dropped(host: id))
        #expect(!f.ce.contains { if case .message = $0 { true } else { false } })
        let before = f.ce
        f.clock.advance(200)
        await f.collect()
        #expect(f.ce == before)
    }

    @Test(arguments: [Settings.HostDrop.beforeKey, .afterAmount])
    func dropsHoldTheirBoundary(_ point: Settings.HostDrop) async throws {
        var settings = Settings()
        settings.client.drop = .afterKey
        settings.client.delays.drop = 1000
        settings.hosts[0].drop = point
        settings.hosts[0].delays.drop = 1000
        let f = await Fixture(settings)
        let app = SessionCrypto(), id = UUID()
        try await f.serve(app, id: id)
        try app.derive(peerPublicKey: f.hostKey())
        try f.host.send(seal(.amount(12345), app), for: id)
        let (host, clientApp) = try await f.connect()
        f.client.writeKey(clientApp.publicKey)
        f.clock.advance(1)
        await f.collect()
        if point == .afterAmount {
            #expect(try f.messages(clientApp) == [.amount(settings.hosts[0].amount)])
            f.ce.removeAll()
            _ = await f.client.write(try seal(.decision(.confirm), clientApp))
        } else {
            #expect(!f.ce.contains(.writeAnswered(.key, nil)))
        }
        f.clock.advance(10)
        await f.collect()
        #expect(!f.he.contains { if case .decision = $0 { true } else { false } })
        #expect(!f.ce.contains { if case .message = $0 { true } else { false } })
        f.clock.advance(2000)
        await f.collect()
        #expect(f.he.contains(.clientLost(session: id)))
        #expect(f.ce.contains(.dropped(host: host)))
    }

    @Test func unavailableLogging() async throws {
        let source = Source(Settings())
        source.result = .unavailable(kind: .missing)
        let log = LogSpy()
        let pair = scriptedRadios(source: source, clock: ManualClock(), log: log)
        var hi = pair.host.events.makeAsyncIterator()
        var ci = pair.client.events.makeAsyncIterator()
        #expect(await hi.next() == .bluetoothState(.unsupported))
        #expect(await ci.next() == .bluetooth(.unsupported))
        #expect(log.entries.map(\.message) == ["missing"])
        await pair.host.serve([], for: UUID())
        pair.client.startScanning()
        #expect(log.entries.map(\.message) == ["missing"])
        source.result = .unavailable(kind: .invalid)
        source.pulse()
        #expect(await hi.next() == .bluetoothState(.unsupported))
        #expect(await ci.next() == .bluetooth(.unsupported))
        #expect(log.entries.map(\.message) == ["missing", "invalid"])
        source.result = .valid(Settings())
        source.pulse()
        #expect(await hi.next() == .bluetoothState(.poweredOn))
        #expect(await ci.next() == .bluetooth(.on))
        #expect(log.entries.map(\.message) == ["missing", "invalid"])
        #expect(log.entries.allSatisfy { $0.category.rawValue == "rehearsal" && $0.error == nil })
    }

    @Test(arguments: [Settings.Decision.confirm, .decline])
    func clientDecisions(_ decision: Settings.Decision) async throws {
        var settings = Settings()
        settings.client.decision = decision
        let f = await Fixture(settings)
        let app = SessionCrypto(), id = UUID()
        try await f.host.serve(MessageCodec.encodeSession(.init(publicKey: app.publicKey, sessionID: app.sessionID)), for: id)
        f.host.advertise("Till", for: id)
        f.clock.advance(settings.client.delays.connect)
        await f.collect()
        #expect(!f.he.contains { if case .clientKey = $0 { true } else { false } })
        f.clock.advance(settings.client.delays.key)
        await f.collect()
        try app.derive(peerPublicKey: f.hostKey())
        try f.host.send(seal(.amount(12345), app), for: id)
        await f.collect()
        #expect(!f.he.contains { if case .decision = $0 { true } else { false } })
        f.clock.advance(settings.client.delays.decision)
        await f.collect()
        let bytes = try #require(f.he.compactMap { event -> [UInt8]? in if case .decision(_, let bytes) = event { bytes } else { nil } }.first)
        #expect(try open(bytes, app) == .decision(decision == .confirm ? .confirm : .decline))
        try f.host.send(seal(.acknowledgement(.decision), app), for: id)
        if decision == .confirm { try f.host.send(seal(.result(.success), app), for: id) }
        f.clock.advance(100)
        await f.collect()
        #expect(!f.he.contains(.clientLost(session: id)))
        f.host.finish(id)
        f.clock.advance(100)
        await f.collect()
        #expect(!f.he.contains(.clientLost(session: id)))
    }

    @Test(arguments: [Settings.Outcome.success, .failure])
    func hostOutcomes(_ outcome: Settings.Outcome) async throws {
        var settings = Settings()
        settings.hosts[0].outcome = outcome
        let f = await Fixture(settings)
        let (_, app) = try await f.connect()
        f.client.writeKey(app.publicKey)
        await f.collect()
        #expect(!f.ce.contains(.writeAnswered(.key, nil)))
        f.clock.advance(settings.hosts[0].delays.key)
        await f.collect()
        #expect(f.ce.contains(.writeAnswered(.key, nil)))
        #expect(try f.messages(app).isEmpty)
        f.clock.advance(settings.hosts[0].delays.amount)
        await f.collect()
        #expect(try f.messages(app) == [.amount(settings.hosts[0].amount)])
        f.ce.removeAll()
        _ = await f.client.write(try seal(.decision(.confirm), app))
        await f.collect()
        #expect(try f.messages(app).isEmpty)
        f.clock.advance(settings.hosts[0].delays.acknowledgement)
        await f.collect()
        #expect(try f.messages(app) == [.acknowledgement(.decision)])
        f.ce.removeAll()
        f.clock.advance(settings.hosts[0].delays.outcome)
        await f.collect()
        #expect(try f.messages(app) == [.result(outcome == .success ? .success : .failure)])
    }

    @Test func hostDecline() async throws {
        let f = await Fixture()
        let (_, app) = try await f.connect()
        f.client.writeKey(app.publicKey)
        f.clock.advance(100)
        await f.collect()
        #expect(try f.messages(app) == [.amount(12345)])
        f.ce.removeAll()
        _ = await f.client.write(try seal(.decision(.decline), app))
        f.clock.advance(1000)
        await f.collect()
        #expect(try f.messages(app) == [.acknowledgement(.decision)])
    }

    @Test func hostCancels() async throws {
        var settings = Settings()
        settings.hosts[0].cancelsAfterAmount = true
        let f = await Fixture(settings)
        let (_, app) = try await f.connect()
        f.client.writeKey(app.publicKey)
        f.clock.advance(100)
        await f.collect()
        #expect(try f.messages(app) == [.amount(12345), .end])
    }

    @Test func anOnAirHostKeepsBeingHeardUntilTheScanStops() async throws {
        var settings = Settings()
        settings.hosts[0].readings = [.init(time: 1, rssi: -40), .init(time: 0, rssi: -50)]
        var quiet = Settings.Host()
        quiet.name = "Quiet"
        quiet.readings = [.init(time: 0, rssi: -60)]
        quiet.goesQuiet = true
        settings.hosts.append(quiet)
        let f = await Fixture(settings)
        f.client.startScanning()
        f.clock.advance(2.05)
        await f.collect()
        let heard = f.ce.compactMap { event -> (String?, Int)? in
            if case .reading(_, let name, let rssi, _) = event { (name, rssi) } else { nil }
        }
        #expect(heard.filter { $0.0 == "Quiet" }.map(\.1) == [-60])
        #expect(heard.filter { $0.0 == "MIZAN-CAFE" }.map(\.1) == [-50, -40, -40, -40, -40, -40, -40])
        f.ce.removeAll()
        f.client.stopScanning()
        f.clock.advance(10)
        await f.collect()
        #expect(f.ce.isEmpty)
    }

    @Test func timedReadings() async throws {
        var settings = Settings()
        settings.hosts[0].readings = [.init(time: 1, rssi: -40), .init(time: 3, rssi: -44)]
        var second = Settings.Host()
        second.name = "Second"
        second.readings = [.init(time: 2, rssi: -60), .init(time: 8, rssi: -61)]
        settings.hosts.append(second)
        let f = await Fixture(settings)
        f.client.startScanning()
        f.client.startScanning()
        f.clock.advance(0.5)
        await f.collect()
        #expect(f.ce.isEmpty)
        f.clock.advance(2.5)
        await f.collect()
        let readings = f.ce.compactMap { event -> (UUID, String?, Int, Double)? in
            if case .reading(let id, let name, let rssi, let time) = event { (id, name, rssi, time) } else { nil }
        }
        #expect(readings.map { $0.1 } == ["MIZAN-CAFE", "Second", "MIZAN-CAFE"])
        #expect(readings.map { $0.2 } == [-40, -60, -44])
        #expect(readings.map { $0.3 } == [1, 2, 3])
        let first = try #require(readings.first?.0)
        #expect(readings.last?.0 == first)
        f.ce.removeAll()
        var nextSettings = settings
        nextSettings.hosts[0].amount = 76543
        f.source.result = .valid(nextSettings)
        await f.collect()
        f.client.stopScanning()
        f.client.connect(to: first)
        f.clock.advance(100)
        await f.collect()
        #expect(f.ce.contains { if case .connected(let id, _, _) = $0 { id == first } else { false } })
        #expect(!f.ce.contains { if case .reading = $0 { true } else { false } })
        let sessionBytes = try #require(f.ce.compactMap { event -> [UInt8]? in
            if case .connected(_, let bytes, _) = event { bytes } else { nil }
        }.last)
        let session = try MessageCodec.decodeSession(sessionBytes)
        let app = try SessionCrypto(sessionID: session.sessionID)
        try app.derive(peerPublicKey: session.publicKey)
        f.client.writeKey(app.publicKey)
        f.clock.advance(100)
        await f.collect()
        #expect(try f.messages(app) == [.amount(settings.hosts[0].amount)])
    }

    @Test(arguments: Settings.ClientDrop.allCases)
    func clientDrops(_ point: Settings.ClientDrop) async throws {
        var settings = Settings()
        settings.client.drop = point
        let f = await Fixture(settings)
        let app = SessionCrypto(), id = UUID()
        try await f.serve(app, id: id)
        if point == .beforeKey {
            #expect(f.he == [.onAir(session: id)])
        } else {
            try app.derive(peerPublicKey: f.hostKey())
            if point == .afterAmount || point == .afterDecision {
                try f.host.send(seal(.amount(12345), app), for: id)
                f.clock.advance(100)
                await f.collect()
            }
            #expect(f.he.contains(.clientLost(session: id)))
            #expect(f.he.contains { if case .decision = $0 { true } else { false } } == (point == .afterDecision))
        }
        let before = f.he
        f.clock.advance(1000)
        await f.collect()
        #expect(f.he == before)
    }

    @Test(arguments: Settings.HostDrop.allCases)
    func hostDrops(_ point: Settings.HostDrop) async throws {
        var settings = Settings()
        settings.hosts[0].drop = point
        settings.hosts[0].delays.amount = 5
        let f = await Fixture(settings)
        let (id, app) = try await f.connect()
        if point != .beforeKey {
            f.client.writeKey(app.publicKey)
            f.clock.advance(100)
            await f.collect()
            if point == .afterAcknowledgement {
                #expect(try f.messages(app) == [.amount(12345)])
                f.ce.removeAll()
                _ = await f.client.write(try seal(.decision(.confirm), app))
                f.clock.advance(100)
                await f.collect()
                #expect(try f.messages(app) == [.acknowledgement(.decision)])
            } else {
                #expect(try f.messages(app) == (point == .afterAmount ? [.amount(12345)] : []))
            }
        }
        #expect(f.ce.contains(.dropped(host: id)))
        let before = f.ce
        f.clock.advance(1000)
        await f.collect()
        #expect(f.ce == before)
    }

    @Test(arguments: [Settings.Bluetooth.on, .off, .notAllowed])
    func bluetoothStates(_ state: Settings.Bluetooth) async {
        var settings = Settings(); settings.bluetooth = state
        let f = await Fixture(settings)
        #expect(f.hs == (state == .on ? .poweredOn : state == .off ? .poweredOff : .unauthorized))
        #expect(f.cs == (state == .on ? .on : state == .off ? .off : .notAllowed))
        f.source.result = .unavailable(kind: .invalid)
        await f.collect()
        #expect(f.hs == .unsupported)
        #expect(f.cs == .unsupported)
    }

    @Test(arguments: [MessageCodec.Message.amount(12345), .acknowledgement(.decision), .result(.success)])
    func unreadableHostMessages(_ message: MessageCodec.Message) async throws {
        let f = await Fixture()
        let app = SessionCrypto(), id = UUID()
        try await f.serve(app, id: id)
        try app.derive(peerPublicKey: f.hostKey())
        try f.host.send(seal(.amount(12345), app), for: id)
        f.clock.advance(100)
        await f.collect()
        if message == .result(.success) { try f.host.send(seal(.acknowledgement(.decision), app), for: id) }
        let wrong = SessionCrypto()
        let peer = try SessionCrypto(sessionID: wrong.sessionID)
        try wrong.derive(peerPublicKey: peer.publicKey)
        try f.host.send(seal(message, wrong), for: id)
        await f.collect()
        #expect(f.he.last == .clientLost(session: id))
    }

    @Test func unreadableClientMessage() async throws {
        let f = await Fixture()
        let (id, app) = try await f.connect()
        f.client.writeKey(app.publicKey)
        f.clock.advance(100)
        await f.collect()
        let wrongHost = SessionCrypto()
        let wrong = try SessionCrypto(sessionID: wrongHost.sessionID)
        try wrong.derive(peerPublicKey: wrongHost.publicKey)
        _ = await f.client.write(try seal(.decision(.confirm), wrong))
        await f.collect()
        #expect(f.ce.last == .dropped(host: id))
    }

    @Test func retireAndDropCancelPendingWork() async throws {
        let f = await Fixture()
        let app = SessionCrypto(), id = UUID()
        try await f.host.serve(MessageCodec.encodeSession(.init(publicKey: app.publicKey, sessionID: app.sessionID)), for: id)
        f.host.advertise("Till", for: id)
        f.host.retire(id)
        f.clock.advance(1000)
        await f.collect()
        #expect(!f.he.contains { if case .clientKey = $0 { true } else { false } })
        let (host, clientApp) = try await f.connect()
        f.client.writeKey(clientApp.publicKey)
        f.client.drop()
        f.clock.advance(1000)
        await f.collect()
        #expect(f.ce.contains(.dropped(host: host)))
        #expect(try f.messages(clientApp).isEmpty)
    }

    @Test func transactionSnapshots() async throws {
        var settings = Settings()
        settings.client.decision = .decline
        let f = await Fixture(settings)
        let app = SessionCrypto(), id = UUID()
        try await f.serve(app, id: id)
        try app.derive(peerPublicKey: f.hostKey())
        settings.client.decision = .confirm
        f.source.result = .valid(settings)
        await f.collect()
        try f.host.send(seal(.amount(12345), app), for: id)
        f.clock.advance(100)
        await f.collect()
        let decision = try #require(f.he.compactMap { event -> [UInt8]? in if case .decision(_, let bytes) = event { bytes } else { nil } }.last)
        #expect(try open(decision, app) == .decision(.decline))
        let next = SessionCrypto(), nextID = UUID()
        try await f.serve(next, id: nextID)
        try next.derive(peerPublicKey: f.hostKeyFor(nextID))
        try f.host.send(seal(.amount(555), next), for: nextID)
        f.clock.advance(100)
        await f.collect()
        let nextDecision = try #require(f.he.compactMap { event -> [UInt8]? in if case .decision(let session, let bytes) = event, session == nextID { bytes } else { nil } }.last)
        #expect(try open(nextDecision, next) == .decision(.confirm))
    }
}

private extension Fixture {
    func hostKeyFor(_ id: UUID) throws -> [UInt8] {
        try #require(he.compactMap { event -> [UInt8]? in if case .clientKey(let session, _, let bytes) = event, session == id { bytes } else { nil } }.last)
    }
}
