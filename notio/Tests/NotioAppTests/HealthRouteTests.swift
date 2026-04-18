import Foundation
import Hummingbird
import HummingbirdTesting
import Testing
@testable import NotioApp

@Suite("HealthRoute")
struct HealthRouteTests {
    @Test func test_healthEndpoint_shouldReturn200WithStatusOk() async throws {
        let app = makeApp()
        try await app.test(.router) { client in
            try await client.execute(uri: "/health", method: .get) { response in
                #expect(response.status == .ok)
                let body = try JSONDecoder().decode(HealthResponse.self, from: response.body)
                #expect(body.status == "ok")
            }
        }
    }
}

// MARK: - Helpers

extension HealthRouteTests {
    private func makeApp() -> some ApplicationProtocol {
        buildApp(config: Config(port: 8080, version: "test", webhookPath: "test-webhook"))
    }
}
