import Testing
@testable import NotioApp

@Suite("Config")
struct ConfigTests {
    @Test func test_fromEnvironment_shouldThrowWhenWebhookPathMissing() {
        #expect(throws: Config.ConfigError.missingWebhookPath) {
            try Config.fromEnvironment([:])
        }
    }

    @Test func test_fromEnvironment_shouldThrowWhenWebhookPathEmpty() {
        #expect(throws: Config.ConfigError.missingWebhookPath) {
            try Config.fromEnvironment(["NOTIO_WEBHOOK_PATH": ""])
        }
    }

    @Test func test_fromEnvironment_shouldSucceedWithWebhookPath() throws {
        let config = try Config.fromEnvironment(["NOTIO_WEBHOOK_PATH": "secret"])
        #expect(config.webhookPath == "secret")
    }

    @Test func test_fromEnvironment_shouldUseDefaultPort() throws {
        let config = try Config.fromEnvironment(["NOTIO_WEBHOOK_PATH": "secret"])
        #expect(config.port == 8080)
    }

    @Test func test_fromEnvironment_shouldUseDefaultVersion() throws {
        let config = try Config.fromEnvironment(["NOTIO_WEBHOOK_PATH": "secret"])
        #expect(config.version == "dev")
    }

    @Test func test_fromEnvironment_shouldReadPortFromEnv() throws {
        let config = try Config.fromEnvironment(["NOTIO_WEBHOOK_PATH": "secret", "NOTIO_PORT": "9090"])
        #expect(config.port == 9090)
    }

    @Test func test_fromEnvironment_shouldReadVersionFromEnv() throws {
        let config = try Config.fromEnvironment(["NOTIO_WEBHOOK_PATH": "secret", "NOTIO_VERSION": "1.2.3"])
        #expect(config.version == "1.2.3")
    }
}
