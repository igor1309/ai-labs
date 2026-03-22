import Foundation

class LLMClientFactory {

    typealias Transport = @Sendable ([String]) async throws -> Void

    private let transport: Transport

    init(transport: @escaping Transport) {

        self.transport = transport
    }

    func make() -> LLMClient {

        let transport = self.transport
        return LLMClient { try await transport($0) }
    }
}
