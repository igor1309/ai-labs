import Foundation
import Hummingbird
import HummingbirdTesting
import Logging
import Testing
@testable import NotioApp

@Suite("WebhookLog")
struct WebhookLogTests {
    @Test func test_webhookLog_shouldEmitRequiredFields() async throws {
        let handler = CapturingLogHandler()
        let logger = Logger(label: "test") { _ in handler }
        let app = makeApp(logger: logger)

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post) { _ in }
        }

        let event = try #require(handler.events.first)
        let metadata = event.metadata ?? [:]
        #expect(metadata["path"] != nil)
        #expect(metadata["method"] != nil)
        #expect(metadata["status"] != nil)
        #expect(metadata["latency_ms"] != nil)
        #expect(metadata["mode"] != nil)
    }

    @Test func test_webhookLog_shouldOmitUpdateIdInAckModeEvenWhenPresent() async throws {
        let handler = CapturingLogHandler()
        let logger = Logger(label: "test") { _ in handler }
        let app = makeApp(logger: logger)
        let body = ByteBuffer(string: #"{"update_id":42}"#)

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post, body: body) { _ in }
        }

        let event = try #require(handler.events.first)
        #expect(event.metadata?["update_id"] == nil)
    }

    @Test func test_inspectMode_shouldReturn200() async throws {
        let handler = CapturingLogHandler()
        let logger = Logger(label: "test") { _ in handler }
        let app = makeApp(logger: logger, diagnosticMode: .inspect)
        let body = ByteBuffer(string: #"{"update_id":42,"message":{"chat":{"id":123},"text":"hello"}}"#)

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post, body: body) { response in
                #expect(response.status == .ok)
            }
        }
    }

    @Test func test_inspectMode_shouldLogUpdateId() async throws {
        let handler = CapturingLogHandler()
        let logger = Logger(label: "test") { _ in handler }
        let app = makeApp(logger: logger, diagnosticMode: .inspect)
        let body = ByteBuffer(string: #"{"update_id":42,"message":{"chat":{"id":123},"text":"hello"}}"#)

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post, body: body) { _ in }
        }

        let event = try #require(handler.events.first)
        #expect(event.metadata?["update_id"] == .string("42"))
    }

    @Test func test_inspectMode_shouldLogChatId() async throws {
        let handler = CapturingLogHandler()
        let logger = Logger(label: "test") { _ in handler }
        let app = makeApp(logger: logger, diagnosticMode: .inspect)
        let body = ByteBuffer(string: #"{"update_id":42,"message":{"chat":{"id":123},"text":"hello"}}"#)

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post, body: body) { _ in }
        }

        let event = try #require(handler.events.first)
        #expect(event.metadata?["chat_id"] == .string("123"))
    }

    @Test func test_inspectMode_shouldLogTruncatedText() async throws {
        let handler = CapturingLogHandler()
        let logger = Logger(label: "test") { _ in handler }
        let app = makeApp(logger: logger, diagnosticMode: .inspect)
        let longText = String(repeating: "a", count: 200)
        let body = ByteBuffer(string: #"{"update_id":1,"message":{"chat":{"id":1},"text":"\#(longText)"}}"#)

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post, body: body) { _ in }
        }

        let event = try #require(handler.events.first)
        let text = try #require(event.metadata?["text"])
        #expect(text.description.count <= 100)
    }

    @Test func test_inspectMode_shouldNotReflectPayloadInResponse() async throws {
        let handler = CapturingLogHandler()
        let logger = Logger(label: "test") { _ in handler }
        let app = makeApp(logger: logger, diagnosticMode: .inspect)
        let body = ByteBuffer(string: #"{"update_id":42,"message":{"chat":{"id":123},"text":"secret"}}"#)

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post, body: body) { response in
                let responseBody = String(buffer: response.body)
                #expect(!responseBody.contains("secret"))
                #expect(!responseBody.contains("42"))
            }
        }
    }
}

// MARK: - Helpers

extension WebhookLogTests {
    private func makeApp(logger: Logger, diagnosticMode: DiagnosticMode? = nil) -> some ApplicationProtocol {
        buildApp(
            config: Config(port: 8080, version: "test", webhookPath: "hook", diagnosticMode: diagnosticMode),
            logger: logger
        )
    }
}

final class CapturingLogHandler: LogHandler, @unchecked Sendable {
    var metadata: Logger.Metadata = [:]
    var logLevel: Logger.Level = .trace
    private(set) var events: [LogEvent] = []

    subscript(metadataKey key: String) -> Logger.Metadata.Value? {
        get { metadata[key] }
        set { metadata[key] = newValue }
    }

    func log(event: LogEvent) {
        events.append(event)
    }
}
