import Foundation

struct LLMClient {

    enum Message: Equatable {
        case assistant(String)
        case assistantToolCall(String)
        case system(String)
        case tool(String)
        case user(String)
    }
    typealias Respond = @Sendable ([Message]) async throws -> Void

    let respond: Respond
}
