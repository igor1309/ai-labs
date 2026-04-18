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

    @Test func test_fromEnvironment_shouldParseInspectMode() throws {
        let config = try Config.fromEnvironment([
            "NOTIO_WEBHOOK_PATH": "secret",
            "NOTIO_DIAGNOSTIC_MODE": "inspect",
        ])
        #expect(config.diagnosticMode == .inspect)
    }

    @Test func test_fromEnvironment_shouldParseDelayModeWithDefault() throws {
        let config = try Config.fromEnvironment([
            "NOTIO_WEBHOOK_PATH": "secret",
            "NOTIO_DIAGNOSTIC_MODE": "delay",
        ])
        #expect(config.diagnosticMode == .delay(milliseconds: 5000))
    }

    @Test func test_fromEnvironment_shouldParseDelayModeWithCustomMs() throws {
        let config = try Config.fromEnvironment([
            "NOTIO_WEBHOOK_PATH": "secret",
            "NOTIO_DIAGNOSTIC_MODE": "delay",
            "NOTIO_DIAGNOSTIC_DELAY_MS": "2000",
        ])
        #expect(config.diagnosticMode == .delay(milliseconds: 2000))
    }

    @Test func test_fromEnvironment_shouldParseFailModeWithDefault() throws {
        let config = try Config.fromEnvironment([
            "NOTIO_WEBHOOK_PATH": "secret",
            "NOTIO_DIAGNOSTIC_MODE": "fail",
        ])
        #expect(config.diagnosticMode == .fail(status: 500))
    }

    @Test func test_fromEnvironment_shouldParseFailModeWithCustomStatus() throws {
        let config = try Config.fromEnvironment([
            "NOTIO_WEBHOOK_PATH": "secret",
            "NOTIO_DIAGNOSTIC_MODE": "fail",
            "NOTIO_DIAGNOSTIC_FAIL_STATUS": "503",
        ])
        #expect(config.diagnosticMode == .fail(status: 503))
    }
}
