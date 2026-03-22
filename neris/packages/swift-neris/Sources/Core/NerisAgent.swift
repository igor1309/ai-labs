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

        let tools: [OpenRouterRequestFactory.Tool] = [
            .init(
                name: "read_file",
                description: "Read the contents of a file at the given path.",
                parameters: [
                    "type": "object",
                    "properties": [
                        "path": [
                            "type": "string",
                            "description": "Absolute path to the file to read.",
                        ],
                    ],
                    "required": ["path"],
                ]
            ),
        ]
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
            requestFactory: { try factory.make($0, tools: tools) },
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
            execute: { call in
                try Self.execute(call)
            }
        )
    }

    public func process(_ input: String) async -> AsyncThrowingStream<AgentLoop.Event, Error> {
        await agentLoop.process(input)
    }

    private static func execute(_ call: AgentLoop.ToolCall) throws -> String {

        guard call.name == "read_file" else { throw UnsupportedToolError(name: call.name) }
        guard let args = try? JSONDecoder().decode(ReadFileArgs.self, from: Data(call.arguments.utf8)),
              !args.path.isEmpty
        else { throw InvalidArgumentsError(tool: call.name, arguments: call.arguments) }
        return try String(contentsOfFile: args.path, encoding: .utf8)
    }
}

private struct ReadFileArgs: Decodable {
    let path: String
}

struct UnsupportedToolError: Error {
    let name: String
}

struct InvalidArgumentsError: Error {
    let tool: String
    let arguments: String
}
