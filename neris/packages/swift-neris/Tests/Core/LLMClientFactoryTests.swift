import Foundation
@testable import NerisCore
import Testing

final class LLMClientFactoryTests: TestContext {

    @Test func test_respond_shouldPassMessagesToTransport() async throws {

        let message = makeSomeString()
        let (client, spy) = makeSUT()

        _ = try await client.respond([message])

        #expect(spy.payloads == [[message]])
    }

    // MARK: - Helpers

    private typealias SUT = LLMClientFactory
    private typealias TransportSpy = AsyncSpyOf<[String], Void>

    private func makeSUT(
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (LLMClient, TransportSpy) {

        let spy = TransportSpy()
        let sut = SUT(transport: spy.call(payload:))
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        trackForMemoryLeaks(spy, sourceLocation: sourceLocation)
        let client = sut.make()
        return (client, spy)
    }
}
