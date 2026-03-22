import Foundation
@testable import NerisCore
import Testing

final class LLMClientFactoryTests: TestContext {

    @Test func test_respond_shouldPassUserMessageToTransport() async throws {

        let content = makeSomeString()
        let (client, spy) = makeSUT()

        _ = try await client.respond([.user(content)])

        #expect(spy.payloads == [[.user(content)]])
    }

    // MARK: - Helpers

    private typealias SUT = LLMClientFactory
    private typealias TransportSpy = AsyncSpyOf<[LLMClient.Message], Void>

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
