import Foundation

class LLMClientFactory {

    private let transport: @Sendable ([String]) async throws -> Void

    init(transport: @escaping @Sendable ([String]) async throws -> Void) {

        self.transport = transport
    }

    func make() -> LLMClient {

        let transport = self.transport
        return LLMClient { try await transport($0) }
    }
}
