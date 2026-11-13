import BrowserBridge
import Composer
import Darwin
import Foundation

/// Plays recorded extension events into the rehearsal the way the native host
/// would: it connects to the app's socket, presents the secret, answers clock
/// pings and sends each event once the audio fed reaches its time. The socket
/// lives in a folder of its own under /tmp, never in the owner's Library.
final class BrowserReplay: Sendable {

    struct Entry: Decodable, Sendable {
        /// Seconds of fed audio at which the event is sent.
        let at: Double
        /// The wire event without its `at`, which the replay stamps from its own clock.
        let event: [String: JSONValue]
    }

    let channel: BrowserChannel
    private let entries: [Entry]
    private let callID: String
    private let path: URL
    private let secret: Data
    private let started = ContinuousClock.now
    private let fed = AsyncStream<Double>.makeStream(bufferingPolicy: .bufferingNewest(1))

    init(file: URL) throws {
        struct Fixture: Decodable { let callId: String; let events: [Entry] }
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: file))
        entries = fixture.events.sorted { $0.at < $1.at }
        callID = fixture.callId
        let folder = URL(fileURLWithPath: "/tmp/audelin-browser-\(getpid())", isDirectory: true)
        path = folder.appendingPathComponent("browser.sock")
        var bytes = [UInt8](repeating: 0, count: BrowserSocketSecret.size)
        arc4random_buf(&bytes, bytes.count)
        secret = Data(bytes)
        let listener = try BrowserSocketListener(path: path, secret: secret)
        channel = BrowserChannel(connections: listener.connections, stop: {
            listener.stop(); try? FileManager.default.removeItem(at: folder)
        })
    }

    /// Seconds of audio fed so far.
    func feed(_ seconds: Double) { fed.continuation.yield(seconds) }

    func finish() { fed.continuation.finish() }

    /// Connects and plays every entry; returns when all are sent or the feed ended.
    func run() async throws {
        let link = try RelayLink.connect(to: path)
        defer { link.close() }
        try await link.send(secret)
        let replies = Task { [started] in
            while let message = try await link.receive() {
                guard let object = try? JSONSerialization.jsonObject(with: message) as? [String: Any],
                      let ping = object["ping"] as? Int else { continue }
                let reply: [String: Any] = ["version": BrowserMessage.version, "ping": ping, "at": Self.milliseconds(since: started)]
                try await link.send(JSONSerialization.data(withJSONObject: reply))
            }
        }
        defer { replies.cancel() }
        var next = entries.enumerated().makeIterator()
        var pending = next.next()
        for await seconds in fed.stream {
            while let (sequence, entry) = pending, entry.at <= seconds {
                var event = entry.event.mapValues(\.any)
                event["at"] = Self.milliseconds(since: started)
                let message: [String: Any] = ["version": BrowserMessage.version, "callId": callID, "sequence": sequence, "event": event]
                try await link.send(JSONSerialization.data(withJSONObject: message))
                pending = next.next()
            }
            if pending == nil { break }
        }
        // Keep answering pings until the rehearsal ends the feed.
        for await _ in fed.stream {}
    }

    private static func milliseconds(since start: ContinuousClock.Instant) -> Double {
        let elapsed = start.duration(to: .now)
        return (Double(elapsed.components.seconds) + Double(elapsed.components.attoseconds) / 1e18) * 1000
    }
}

/// Any JSON value, read from the fixture and written back unchanged.
enum JSONValue: Decodable, Sendable {
    case string(String), number(Double), bool(Bool), array([JSONValue]), object([String: JSONValue])

    init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([JSONValue].self) { self = .array(value) }
        else { self = .object(try container.decode([String: JSONValue].self)) }
    }

    var any: Any {
        switch self {
        case let .string(value): value
        case let .number(value): value
        case let .bool(value): value
        case let .array(value): value.map(\.any)
        case let .object(value): value.mapValues(\.any)
        }
    }
}
