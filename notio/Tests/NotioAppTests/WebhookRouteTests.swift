import Foundation
import Hummingbird
import HummingbirdTesting
import NIOCore
import Testing
@testable import NotioApp

@Suite("WebhookRoute")
struct WebhookRouteTests {
    @Test func test_post_shouldReturn200Immediately() async throws {
        let app = try makeApp(webhookPath: "secret-path")
        try await app.test(.router) { client in
            try await client.execute(uri: "/secret-path", method: .post) { response in
                #expect(response.status == .ok)
            }
        }
    }

    @Test func test_post_shouldReturnOkBody() async throws {
        let app = try makeApp(webhookPath: "secret-path")
        try await app.test(.router) { client in
            try await client.execute(uri: "/secret-path", method: .post) { response in
                #expect(String(buffer: response.body) == "ok")
            }
        }
    }

    @Test func test_post_shouldReturn404ForUnknownPath() async throws {
        let app = try makeApp(webhookPath: "secret-path")
        try await app.test(.router) { client in
            try await client.execute(uri: "/other-path", method: .post) { response in
                #expect(response.status == .notFound)
            }
        }
    }

    @Test func test_post_shouldReturn404WhenWebhookPathDiffers() async throws {
        let app = try makeApp(webhookPath: "real-secret")
        try await app.test(.router) { client in
            try await client.execute(uri: "/wrong-secret", method: .post) { response in
                #expect(response.status == .notFound)
            }
        }
    }

    @Test func test_diagnosticMode_shouldBeNilByDefault() async throws {
        let config = Config(port: 8080, version: "test", webhookPath: "hook")
        #expect(config.diagnosticMode == nil)
    }

    @Test func test_diagnosticMode_ackShouldBeSetWhenConfigured() async throws {
        let config = Config(
            port: 8080,
            version: "test",
            webhookPath: "hook",
            diagnosticMode: .ack
        )
        #expect(config.diagnosticMode == .ack)
    }
}

// MARK: - Helpers

extension WebhookRouteTests {
    private func makeApp(webhookPath: String) throws -> some ApplicationProtocol {
        try buildApp(
            config: Config(port: 8080, version: "test", webhookPath: webhookPath),
            enricher: NullEnricher(),
            messenger: NoOpCaptureFeedbackMessenger()
        )
    }
}
