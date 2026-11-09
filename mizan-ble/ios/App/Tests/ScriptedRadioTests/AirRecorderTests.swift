import Foundation
import Testing
import ScriptedSettings
import SessionCrypto
import MessageCodec
@testable import ScriptedRadio

@MainActor final class RecordingSpy {
    var lines: [Data] = []
    lazy var recorder = AirRecorder { [weak self] in self?.lines.append($0) }
    func records() throws -> [[String: String]] {
        try lines.map { try JSONDecoder().decode([String: String].self, from: $0) }
    }
}

@MainActor @Suite struct AirRecorderTests {
    @Test func serializesOneJSONLinePerFrame() throws {
        let spy = RecordingSpy()
        spy.recorder.record([0, 255, 16], direction: "hostToClient", enabled: true)
        spy.recorder.record([2, 1], direction: "clientToHost", enabled: true)
        #expect(try spy.records() == [
            ["direction": "hostToClient", "hex": "00ff10"],
            ["direction": "clientToHost", "hex": "0201"]
        ])
        #expect(spy.lines.allSatisfy { $0.last == 10 && $0.filter { $0 == 10 }.count == 1 })
    }

    @Test func fileAppendsWithoutReplacingEarlierFrames() async throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appending(path: "air-recording.jsonl")
        let first = AirFile(path: path)
        first.append(Data("first\n".utf8))
        await first.flush()
        let relaunched = AirFile(path: path)
        relaunched.append(Data("second\n".utf8))
        await relaunched.flush()
        #expect((try? String(contentsOf: path, encoding: .utf8)) == "first\nsecond\n")
    }

    @Test func settingsOptIn() throws {
        #expect(Settings().recordAir == false)
        #expect(try JSONDecoder().decode(Settings.self, from: Data("{\"recordAir\":true}".utf8)).recordAir)
        #expect(try JSONDecoder().decode(Settings.self, from: Data("{}".utf8)).recordAir == false)
    }

    @Test(arguments: [true, false])
    func recordsBothDirectionsForBothRoles(_ enabled: Bool) async throws {
        var settings = Settings()
        settings.recordAir = enabled
        let f = await Fixture(settings)
        let app = SessionCrypto(), id = UUID()
        let session = try MessageCodec.encodeSession(.init(publicKey: app.publicKey, sessionID: app.sessionID))
        try await f.serve(app, id: id)
        let key = try f.hostKey()
        try app.derive(peerPublicKey: key)
        let amount = try seal(.amount(12345), app)
        try f.host.send(amount, for: id)
        f.clock.advance(100)
        await f.collect()
        let decision = try #require(f.he.compactMap { event -> [UInt8]? in
            if case .decision(_, let bytes) = event { bytes } else { nil }
        }.first)
        let ack = try seal(.acknowledgement(.decision), app)
        let result = try seal(.result(.success), app)
        let end = try seal(.end, app)
        for frame in [ack, result, end] { try f.host.send(frame, for: id) }
        let hostFrames = try f.recording.records()
        let expectedHost = zip(["hostToClient", "clientToHost", "hostToClient", "clientToHost", "hostToClient", "hostToClient", "hostToClient"],
                               [session, key, amount, decision, ack, result, end]).map { direction, frame in
            ["direction": direction, "hex": frame.map { String(format: "%02x", $0) }.joined()]
        }
        #expect(hostFrames == (enabled ? expectedHost : []))

        f.recording.lines.removeAll()
        let (_, phone) = try await f.connect()
        let sessionFrame = try #require(f.ce.compactMap { event -> [UInt8]? in
            if case .connected(_, let bytes, _) = event { bytes } else { nil }
        }.last)
        f.client.writeKey(phone.publicKey)
        f.clock.advance(100)
        await f.collect()
        let confirm = try seal(.decision(.confirm), phone)
        _ = await f.client.write(confirm)
        f.clock.advance(100)
        await f.collect()
        let incoming = f.ce.compactMap { event -> [UInt8]? in
            if case .message(_, let bytes) = event { bytes } else { nil }
        }
        let frames = [sessionFrame, phone.publicKey, incoming[0], confirm] + Array(incoming.dropFirst())
        let directions = ["hostToClient", "clientToHost", "hostToClient", "clientToHost", "hostToClient", "hostToClient"]
        #expect(try f.recording.records() == (enabled ? zip(directions, frames).map { direction, frame in
            ["direction": direction, "hex": frame.map { String(format: "%02x", $0) }.joined()]
        } : []))
    }
}
