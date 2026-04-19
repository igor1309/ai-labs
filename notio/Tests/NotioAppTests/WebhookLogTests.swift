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

    @Test func test_normalMode_shouldLogUpdateId() async throws {
        let handler = CapturingLogHandler()
        let logger = Logger(label: "test") { _ in handler }
        let app = makeApp(logger: logger)
        let body = ByteBuffer(string: #"{"update_id":42,"message":{"message_id":1,"chat":{"id":123},"date":0,"text":"hi"}}"#)

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post, body: body) { _ in }
        }

        let event = try #require(handler.events.first)
        #expect(event.metadata?["update_id"] == .string("42"))
    }

    @Test func test_normalMode_shouldLogChatId() async throws {
        let handler = CapturingLogHandler()
        let logger = Logger(label: "test") { _ in handler }
        let app = makeApp(logger: logger)
        let body = ByteBuffer(string: #"{"update_id":1,"message":{"message_id":1,"chat":{"id":456},"date":0,"text":"hi"}}"#)

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post, body: body) { _ in }
        }

        let event = try #require(handler.events.first)
        #expect(event.metadata?["chat_id"] == .string("456"))
    }

    @Test func test_normalMode_shouldHandleInvalidJson() async throws {
        let handler = CapturingLogHandler()
        let logger = Logger(label: "test") { _ in handler }
        let app = makeApp(logger: logger)
        let body = ByteBuffer(string: "not json")

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post, body: body) { response in
                #expect(response.status == .ok)
            }
        }
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

    @Test func test_delayMode_shouldReturn200() async throws {
        let handler = CapturingLogHandler()
        let logger = Logger(label: "test") { _ in handler }
        let app = makeApp(logger: logger, diagnosticMode: .delay(milliseconds: 10))

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post) { response in
                #expect(response.status == .ok)
            }
        }
    }

    @Test func test_delayMode_shouldLogLatency() async throws {
        let handler = CapturingLogHandler()
        let logger = Logger(label: "test") { _ in handler }
        let app = makeApp(logger: logger, diagnosticMode: .delay(milliseconds: 10))

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post) { _ in }
        }

        let event = try #require(handler.events.first)
        #expect(event.metadata?["mode"] == .string("delay(milliseconds: 10)"))
        #expect(event.metadata?["latency_ms"] != nil)
    }

    @Test func test_failMode_shouldReturnConfiguredStatus() async throws {
        let handler = CapturingLogHandler()
        let logger = Logger(label: "test") { _ in handler }
        let app = makeApp(logger: logger, diagnosticMode: .fail(status: 503))

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post) { response in
                #expect(response.status.code == 503)
            }
        }
    }

    @Test func test_failMode_shouldLogFailure() async throws {
        let handler = CapturingLogHandler()
        let logger = Logger(label: "test") { _ in handler }
        let app = makeApp(logger: logger, diagnosticMode: .fail(status: 500))

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post) { _ in }
        }

        let event = try #require(handler.events.first)
        #expect(event.metadata?["mode"] == .string("fail(status: 500)"))
        #expect(event.metadata?["status"] == .string("500"))
    }

    @Test func test_normalMode_shouldCallStoreWithCapturedItem() async throws {
        let spy = SpyCaptureStore()
        let handler = CapturingLogHandler()
        let logger = Logger(label: "test") { _ in handler }
        let app = buildApp(
            config: Config(port: 8080, version: "test", webhookPath: "hook"),
            logger: logger,
            store: spy
        )
        let body = ByteBuffer(string: #"{"update_id":1,"message":{"message_id":1,"chat":{"id":1},"date":0,"text":"https://example.com check later"}}"#)

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post, body: body) { response in
                #expect(response.status == .ok)
            }
        }

        try await Task.sleep(for: .milliseconds(50))
        #expect(spy.savedItems.count == 1)
        #expect(spy.savedItems.first?.kind == .link)
        #expect(spy.savedItems.first?.url == "https://example.com")
        #expect(spy.savedItems.first?.note == "check later")
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
