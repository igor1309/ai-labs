import Foundation

public final class NerisAgent: Sendable {

    public struct Config: Sendable {
        public let apiKey: String
        public let model: String
        public let systemPrompt: String?

        public init(apiKey: String, model: String, systemPrompt: String? = nil) {
            self.apiKey = apiKey
            self.model = model
            self.systemPrompt = systemPrompt
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
        let systemPrompt = config.systemPrompt
        self.agentLoop = AgentLoop(
            respond: { messages in
                var openRouterMessages = messages.map(\.toOpenRouterMessage)
                if let systemPrompt {
                    openRouterMessages.insert(.system(systemPrompt), at: 0)
                }
                let response = try await client.send(openRouterMessages)
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
