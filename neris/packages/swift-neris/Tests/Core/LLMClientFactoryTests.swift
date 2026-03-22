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

    @Test func test_respond_shouldReturnTransportResponse() async throws {

        let expected = makeSomeString()
        let (client, _) = makeSUT(transportStubs: [.success(expected)])

        let result = try await client.respond([.user(makeSomeString())])

        #expect(result == expected)
    }

    @Test func test_respond_shouldThrow_onTransportError() async throws {

        let (client, _) = makeSUT(transportStubs: [.failure(makeSomeError())])

        await #expect(throws: (any Error).self) {
            _ = try await client.respond([.user(makeSomeString())])
        }
    }

    // MARK: - Helpers

    private typealias SUT = LLMClientFactory
    private typealias TransportSpy = AsyncSpyOf<[LLMClient.Message], LLMClient.Response>

    private func makeSUT(
        transportStubs: [TransportSpy.Stub] = [.success(makeSomeString())],
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (LLMClient, TransportSpy) {

        let spy = TransportSpy(stubs: transportStubs)
        let sut = SUT(transport: spy.call(payload:))
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        trackForMemoryLeaks(spy, sourceLocation: sourceLocation)
        let client = sut.make()
        return (client, spy)
    }
}
