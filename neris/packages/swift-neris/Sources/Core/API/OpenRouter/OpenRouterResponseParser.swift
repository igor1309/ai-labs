import Foundation

final class OpenRouterResponseParser {

    struct ToolCallResponse: Equatable {
        let id: String
        let name: String
        let arguments: String
    }

    enum Response: Equatable {
        case text(String)
        case toolCalls([ToolCallResponse])
    }

    func parse(_ data: Data, _ response: URLResponse) throws -> Response {

        guard let httpResponse = response as? HTTPURLResponse else { throw InvalidResponseError() }
        guard httpResponse.statusCode == 200 else { throw BadStatusCodeError(statusCode: httpResponse.statusCode) }
        guard let choice = try? JSONDecoder().decode(Body.self, from: data).choices.first
        else { throw InvalidResponseError() }
        switch choice.finishReason {
        case "tool_calls":
            guard let toolCalls = choice.message.toolCalls, !toolCalls.isEmpty else { throw InvalidResponseError() }
            return .toolCalls(toolCalls.map { .init(id: $0.id, name: $0.function.name, arguments: $0.function.arguments) })
        case "error":
            throw ServerError()
        default:
            guard let content = choice.message.content else { throw InvalidResponseError() }
            return .text(content)
        }
    }

    struct InvalidResponseError: Error {}
    struct ServerError: Error {}

    struct BadStatusCodeError: Error {
        let statusCode: Int
    }

    private struct Body: Decodable {
        let choices: [Choice]
    }

    private struct Choice: Decodable {
        let message: Message
        let finishReason: String

        enum CodingKeys: String, CodingKey {
            case message
            case finishReason = "finish_reason"
        }
    }

    private struct Message: Decodable {
        let content: String?
        let toolCalls: [ToolCall]?

        enum CodingKeys: String, CodingKey {
            case content
            case toolCalls = "tool_calls"
        }
    }

    private struct ToolCall: Decodable {
        let id: String
        let function: Function
    }

    private struct Function: Decodable {
        let name: String
        let arguments: String
    }
}
