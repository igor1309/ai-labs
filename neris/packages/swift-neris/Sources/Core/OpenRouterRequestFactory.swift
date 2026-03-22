import Foundation

final class OpenRouterRequestFactory {

    enum Message {
        case assistant(String)
        case system(String)
        case tool(toolCallId: String, content: String)
        case user(String)
    }

    struct Config {
        let apiKey: String
        let model: String
        let url: URL
    }

    typealias ConfigProvider = () throws -> Config

    private let config: ConfigProvider

    init(config: @escaping ConfigProvider) {

        self.config = config
    }

    func make(_ messages: [Message]) throws -> URLRequest {

        guard !messages.isEmpty else { throw EmptyMessagesError() }
        let config = try config()
        var request = URLRequest(url: config.url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "model": config.model,
            "messages": messages.serialized,
        ])
        return request
    }

    struct EmptyMessagesError: Error {}
}

private extension Array where Element == OpenRouterRequestFactory.Message {

    var serialized: [[String: String]] {

        map { message in
            switch message {
            case .assistant(let content): ["role": "assistant", "content": content]
            case .system(let content): ["role": "system", "content": content]
            case .tool(let toolCallId, let content): ["role": "tool", "tool_call_id": toolCallId, "content": content]
            case .user(let content): ["role": "user", "content": content]
            }
        }
    }
}
