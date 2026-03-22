import Foundation

public final class NerisAgent: Sendable {

    public struct Config: Sendable {
        public let apiKey: String
        public let model: String

        public init(apiKey: String, model: String) {
            self.apiKey = apiKey
            self.model = model
        }
    }

    private let agentLoop: AgentLoop

    public init(config: Config) {

        let factory = OpenRouterRequestFactory(config: {
            .init(
                apiKey: config.apiKey,
                model: config.model,
                url: URL(string: "https://openrouter.ai/api/v1/chat/completions")!,
                stream: false
            )
        })
        let parser = OpenRouterResponseParser()
        let client = NetworkClient(
            requestFactory: { try factory.make($0) },
            transport: URLSession.shared.data(for:),
            responseParser: { try parser.parse($0.0, $0.1) }
        )
        self.agentLoop = AgentLoop(
            respond: { messages in
                let response = try await client.send(messages.map(\.toOpenRouterMessage))
                return response.toAgentResponse
            },
            execute: { _ in throw UnsupportedToolError() }
        )
    }

    public func process(_ input: String) async -> AsyncThrowingStream<AgentLoop.Event, Error> {
        await agentLoop.process(input)
    }
}

struct UnsupportedToolError: Error {}
