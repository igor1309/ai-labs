import Foundation

class LLMClientFactory {

    typealias Transport = @Sendable ([LLMClient.Message]) async throws -> String

    private let transport: Transport

    init(transport: @escaping Transport) {

        self.transport = transport
    }

    func make() -> LLMClient {

        let transport = self.transport
        return LLMClient { try await transport($0) }
    }
}
