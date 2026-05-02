import Testing
@testable import NotioApp

@Suite("App")
struct AppTests {
    @Test func test_buildApp_shouldThrowWhenNormalModeMissingMessenger() {
        let config = Config(port: 8080, version: "test", webhookPath: "hook")

        #expect(throws: AppBuildError.missingFeedbackMessenger) {
            _ = try buildAppForTest(config: config)
        }
    }

    @Test func test_buildApp_shouldThrowWhenNormalModeMissingStore() {
        let config = Config(port: 8080, version: "test", webhookPath: "hook")

        #expect(throws: AppBuildError.missingCaptureStore) {
            _ = try buildApp(
                config: config,
                enricher: NullEnricher(),
                messenger: NoOpCaptureFeedbackMessenger()
            )
        }
    }
}

// MARK: - Helpers

private extension AppTests {
    func buildAppForTest(config: Config) throws {
        _ = try buildApp(config: config, enricher: NullEnricher())
    }
}
