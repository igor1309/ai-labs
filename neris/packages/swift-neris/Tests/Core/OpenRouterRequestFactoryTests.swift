import Foundation
import Testing

final class OpenRouterRequestFactoryTests: TestContext {

    @Test func test_init_shouldNotCallConfig() {

        let (_, config) = makeSUT()

        #expect(config.callCount == 0)
    }

    // MARK: - Helpers

    private typealias SUT = OpenRouterRequestFactory
    private typealias ConfigSpy = CallSpy<Void, Void>

    private func makeSUT(
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (sut: SUT, config: ConfigSpy) {

        let config = ConfigSpy()
        let sut = SUT(config: config.call)
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        trackForMemoryLeaks(config, sourceLocation: sourceLocation)
        return (sut, config)
    }
}

private class OpenRouterRequestFactory {

    init(config: @escaping () -> Void) {
    }
}
