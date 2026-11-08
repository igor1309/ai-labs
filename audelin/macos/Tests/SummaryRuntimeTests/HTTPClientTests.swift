import BlockingTestWork
import Foundation
import Network
import SummaryRuntime
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1))) struct HTTPClientTests {
    /// Contract test: URLSession against an actual loopback server, including a rejected redirect.
    @Test(arguments: ["success", "redirect", "oversized", "unknown-length", "chunked"])
    func loopbackCollectionAndRedirectPolicy(scenario: String) async throws {
        let server = try await LoopbackServer.make(scenario: scenario)
        do {
            let client = HTTPClient(limit: 1024, sleep: { try await cancellation() })
            let task = Task { try await client.request(url: server.url, headers: ["Authorization": "Bearer synthetic"], body: Data("synthetic transcript".utf8), loopback: true) }
            if scenario == "success" {
                let output = try await task.value
                #expect(output.status == 200)
                #expect(String(decoding: output.body, as: UTF8.self) == "complete")
            } else {
                await #expect(throws: scenario == "redirect" ? Failure.transport : Failure.outputLimit) { try await task.value }
            }
            #expect(server.requests.withLock { $0 }.count == 1)
            #expect(server.requests.withLock { $0.first?.contains("synthetic transcript") == true })
            if scenario == "unknown-length" || scenario == "chunked" { await server.clientClosed() }
            await server.stop()
        } catch { await server.stop(); throw error }
    }
    /// Contract test: an active URLSession task is closed on injected timeout or cancellation.
    @Test(arguments: [false, true])
    func heldResponseClosesOnTimeoutOrCancellation(cancel: Bool) async throws {
        let server = try await LoopbackServer.make(scenario: "hold"), deadline = Deadline()
        do {
            let client = HTTPClient(limit: 1024, sleep: { try await deadline.wait() })
            let task = Task { try await client.request(url: server.url, headers: [:], body: Data("input".utf8), loopback: true) }
            await server.received()
            await deadline.started()
            if cancel { task.cancel() } else { deadline.fire() }
            await #expect(throws: cancel ? Failure.cancelled : Failure.timeout) { try await task.value }
            await server.stop()
        } catch { await server.stop(); throw error }
    }
}
private final class LoopbackServer: Sendable {
    let listener: NWListener
    let scenario: String
    let requests = Mutex<[String]>([])
    private let connections = Mutex<[NWConnection]>([])
    private let signal = AsyncStream<Void>.makeStream()
    private let closed = AsyncStream<Void>.makeStream()
    private let queue = DispatchQueue(label: "summary.test.http")
    var url: URL { URL(string: "http://127.0.0.1:\(listener.port!.rawValue)/v1/chat/completions")! }
    init(listener: NWListener, scenario: String) { self.listener = listener; self.scenario = scenario }
    static func make(scenario: String) async throws -> LoopbackServer {
        let listener = try NWListener(using: .tcp, on: .any)
        let server = LoopbackServer(listener: listener, scenario: scenario)
        try await server.start()
        return server
    }
    func start() async throws {
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, any Error>) in
            let pending = Mutex(true)
            listener.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    if pending.withLock({ let was = $0; $0 = false; return was }) { done.resume() }
                case let .failed(error):
                    if pending.withLock({ let was = $0; $0 = false; return was }) { done.resume(throwing: error) }
                default: break
                }
            }
            listener.newConnectionHandler = { [self] connection in
                connections.withLock { $0.append(connection) }
                connection.start(queue: queue)
                receive(connection, accumulated: Data())
            }
            listener.start(queue: queue)
        }
    }
    func received() async { for await _ in signal.stream { return } }
    func clientClosed() async { for await _ in closed.stream { return } }
    private func observeClientClose(_ connection: NWConnection) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1024) { [self] _, _, complete, error in
            if complete || error != nil { closed.continuation.yield(()) }
            else { observeClientClose(connection) }
        }
    }
    private func receive(_ connection: NWConnection, accumulated: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [self] data, _, complete, error in
            var bytes = accumulated
            if let data { bytes.append(data) }
            let text = String(decoding: bytes, as: UTF8.self)
            if let range = text.range(of: "\r\n\r\n") {
                let headers = String(text[..<range.lowerBound])
                let length = headers.components(separatedBy: "\r\n").first { $0.lowercased().hasPrefix("content-length:") }.flatMap { Int($0.split(separator: ":")[1].trimmingCharacters(in: .whitespaces)) } ?? 0
                if text[range.upperBound...].utf8.count >= length {
                    requests.withLock { $0.append(text) }; signal.continuation.yield(())
                    if scenario == "hold" { return }
                    let response: String
                    switch scenario {
                    case "redirect": response = "HTTP/1.1 307 Temporary Redirect\r\nLocation: \(url)\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                    case "oversized": response = "HTTP/1.1 200 OK\r\nContent-Length: 2048\r\n\r\n" + String(repeating: "x", count: 2048)
                    case "unknown-length": response = "HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n" + String(repeating: "x", count: 2048)
                    case "chunked": response = "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n"
                        + "300\r\n" + String(repeating: "x", count: 768) + "\r\n"
                        + "300\r\n" + String(repeating: "y", count: 768) + "\r\n0\r\n\r\n"
                    default: response = "HTTP/1.1 200 OK\r\nContent-Length: 8\r\nConnection: close\r\n\r\ncomplete"
                    }
                    if scenario == "unknown-length" || scenario == "chunked" {
                        connection.send(content: Data(response.utf8), isComplete: true, completion: .contentProcessed { _ in })
                        observeClientClose(connection)
                    } else {
                        connection.send(content: Data(response.utf8), completion: .contentProcessed { _ in connection.cancel() })
                    }
                    return
                }
            }
            if !complete && error == nil { receive(connection, accumulated: bytes) }
        }
    }
    func stop() async {
        for connection in connections.withLock({ $0 }) { connection.cancel() }
        await withCheckedContinuation { done in
            listener.stateUpdateHandler = { state in if case .cancelled = state { done.resume() } }
            listener.cancel()
        }
        signal.continuation.finish()
        closed.continuation.finish()
    }
}
private func cancellation() async throws {
    let never = AsyncStream<Void> { _ in }
    for await _ in never {}
    try Task.checkCancellation()
}
private final class Deadline: Sendable {
    private struct State { var continuation: CheckedContinuation<Void, any Error>?; var cancelled = false }
    private let state = Mutex(State())
    private let signal = AsyncStream<Void>.makeStream()
    func started() async { for await _ in signal.stream { return } }
    func wait() async throws {
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, any Error>) in
                state.withLock { value in
                    if value.cancelled { done.resume(throwing: CancellationError()) } else { value.continuation = done }
                }
                signal.continuation.yield(())
            }
        } onCancel: { self.state.withLock { $0.cancelled = true; $0.continuation?.resume(throwing: CancellationError()); $0.continuation = nil } }
    }
    func fire() { state.withLock { $0.continuation?.resume(); $0.continuation = nil } }
}
