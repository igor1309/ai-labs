import Foundation
@testable import NerisCore
import Testing

final class OpenRouterRespondClientTests {

    @Test(.enabled(if: ProcessInfo.processInfo.environment["OPENROUTER_API_KEY"] != nil))
    func test_send_shouldReturnTextResponse() async throws {

        let sut = makeSUT(apiKey: ProcessInfo.processInfo.environment["OPENROUTER_API_KEY"]!)

        let response = try await sut.send([.user("Say hello in one word.")])

        guard case .text(let text) = response else {
            Issue.record("Expected .text response, got \(response)")
            return
        }
        #expect(!text.isEmpty)
    }

    // MARK: - Helpers

    private typealias SUT = OpenRouterRespondClient

    private func makeSUT(apiKey: String) -> SUT {

        SUT(
            config: {
                .init(
                    apiKey: apiKey,
                    model: "nvidia/nemotron-3-super-120b-a12b:free",
                    url: URL(string: "https://openrouter.ai/api/v1/chat/completions")!,
                    stream: false
                )
            },
            transport: URLSession.shared.data(for:)
        )
    }

}

// MARK: - OpenRouterRespondClient

private final class OpenRouterRespondClient {

    typealias Message = OpenRouterRequestFactory.Message
    typealias Response = OpenRouterResponseParser.Response

    private let client: NetworkClient<[Message], Response>

    init(config: @escaping OpenRouterRequestFactory.ConfigProvider, transport: @escaping NetworkClient<[Message], Response>.Transport) {

        let factory = OpenRouterRequestFactory(config: config)
        let parser = OpenRouterResponseParser()
        self.client = NetworkClient(
            requestFactory: { try factory.make($0) },
            transport: transport,
            responseParser: { try parser.parse($0.0, $0.1) }
        )
    }

    func send(_ messages: [Message]) async throws -> Response {

        try await client.send(messages)
    }
}
