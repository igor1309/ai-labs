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
}

// MARK: - Helpers

extension WebhookLogTests {
    private func makeApp(logger: Logger) -> some ApplicationProtocol {
        buildApp(config: Config(port: 8080, version: "test", webhookPath: "hook"), logger: logger)
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
