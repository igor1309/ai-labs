import Foundation

struct LLMClient {

    typealias Message = String
    typealias Respond = @Sendable ([Message]) async throws -> Void

    let respond: Respond
}
