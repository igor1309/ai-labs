import Foundation
import Hummingbird
import HummingbirdTesting
import Testing
@testable import NotioApp

@Suite("VersionRoute")
struct VersionRouteTests {
    @Test func test_versionEndpoint_shouldReturnConfiguredVersion() async throws {
        let app = makeApp(config: makeConfig(version: "1.2.3"))
        try await app.test(.router) { client in
            try await client.execute(uri: "/version", method: .get) { response in
                #expect(response.status == .ok)
                let body = try JSONDecoder().decode(VersionResponse.self, from: response.body)
                #expect(body.version == "1.2.3")
            }
        }
    }
}

// MARK: - Helpers

extension VersionRouteTests {
    private func makeConfig(version: String = "test") -> Config {
        Config(port: 8080, version: version, webhookPath: "test-webhook")
    }

    private func makeApp(config: Config) -> some ApplicationProtocol {
        buildApp(config: config)
    }
}
