import Foundation
@testable import NexumServer
import XCTest

final class NexumServerConfigurationTests: XCTestCase {

    func test_fromEnvironment_shouldReturnConfiguration_onAllRequiredVariablesPresent() throws {
        let environment: [String: String] = [
            "AUTH_PASSWORD_HASH": "hash",
            "AUTH_USERNAME": "user",
            "DATABASE_PATH": "/tmp/nexum.db",
            "JWT_SECRET": "secret",
            "PORT": "9090",
        ]

        let configuration = try NexumServerConfiguration.fromEnvironment(environment)

        XCTAssertEqual(configuration.port, 9090)
    }

    func test_fromEnvironment_shouldThrowMissingVariableError_onRequiredVariableMissing() {
        let environment: [String: String] = [
            "AUTH_PASSWORD_HASH": "hash",
            "AUTH_USERNAME": "user",
            "JWT_SECRET": "secret",
        ]

        XCTAssertThrowsError(try NexumServerConfiguration.fromEnvironment(environment)) { error in
            XCTAssertEqual(
                error as? NexumServerConfigurationError,
                .missingRequiredEnvironmentVariable("DATABASE_PATH")
            )
        }
    }

    func test_fromEnvironment_shouldDefaultPortTo8080_onPortMissing() throws {
        let environment: [String: String] = [
            "AUTH_PASSWORD_HASH": "hash",
            "AUTH_USERNAME": "user",
            "DATABASE_PATH": "/tmp/nexum.db",
            "JWT_SECRET": "secret",
        ]

        let configuration = try NexumServerConfiguration.fromEnvironment(environment)

        XCTAssertEqual(configuration.port, 8080)
    }
}
