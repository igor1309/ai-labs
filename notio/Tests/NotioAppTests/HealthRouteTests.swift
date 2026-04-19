import Foundation
import Hummingbird
import HummingbirdTesting
import NIOCore
import Testing
@testable import NotioApp

@Suite("HealthRoute")
struct HealthRouteTests {
    @Test func test_healthEndpoint_shouldReturn200WithStatusOk() async throws {
        let app = try makeApp()
        try await app.test(.router) { client in
            try await client.execute(uri: "/health", method: .get) { response in
                #expect(response.status == .ok)
                let body = try JSONDecoder().decode(HealthResponse.self, from: Data(response.body.readableBytesView))
                #expect(body.status == "ok")
            }
        }
    }
}

// MARK: - Helpers

extension HealthRouteTests {
    private func makeApp() throws -> some ApplicationProtocol {
        try buildApp(
            config: Config(port: 8080, version: "test", webhookPath: "test-webhook"),
            enricher: NullEnricher(),
            messenger: NoOpCaptureFeedbackMessenger()
        )
    }
}
