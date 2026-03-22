import Foundation
import Testing

final class OpenRouterRequestFactoryTests: TestContext {

    @Test func test_init_shouldNotCallConfig() {

        let (_, config) = makeSUT()

        #expect(config.callCount == 0)
    }

    @Test func test_make_shouldThrow_onEmptyMessages() {

        let (sut, _) = makeSUT()

        #expect(throws: SUT.EmptyMessagesError.self) {
            _ = try sut.make([Message]())
        }
    }

    @Test func test_make_shouldCallConfig_onOneMessage() throws {

        let (sut, config) = makeSUT()

        _ = try sut.make([makeMessage()])

        #expect(config.callCount == 1)
    }

    @Test func test_make_shouldCallConfig_onTwoMessages() throws {

        let (sut, config) = makeSUT()

        _ = try sut.make([makeMessage(), makeMessage()])

        #expect(config.callCount == 1)
    }

    @Test func test_make_shouldThrow_onConfigError() {

        let (sut, _) = makeSUT(configStubs: [.failure(makeSomeError())])

        #expect(throws: (any Error).self) {
            _ = try sut.make([makeMessage()])
        }
    }

    // MARK: - Helpers

    private typealias SUT = OpenRouterRequestFactory
    private typealias Message = String
    private typealias ConfigSpy = CallSpy<Void, Result<Void, Error>>

    private func makeSUT(
        configStubs: [Result<Void, Error>]? = nil,
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (sut: SUT, config: ConfigSpy) {

        let configStubs = configStubs ?? [.success(())]
        let config = ConfigSpy(stubs: configStubs)
        let sut = SUT(config: { try config.call().get() })
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        trackForMemoryLeaks(config, sourceLocation: sourceLocation)
        return (sut, config)
    }

    private func makeMessage() -> Message {

        makeSomeString()
    }
}

private class OpenRouterRequestFactory {

    private let config: () throws -> Void

    init(config: @escaping () throws -> Void) {

        self.config = config
    }

    func make(_ messages: [String]) throws {

        guard !messages.isEmpty else { throw EmptyMessagesError() }
        try config()
    }

    struct EmptyMessagesError: Error {}
}
