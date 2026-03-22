import Foundation
@testable import NerisCore
import Testing

final class OpenRouterResponseAdapterTests: TestContext {

    @Test func test_toAgentResponse_shouldMapText() {

        let content = makeSomeString()
        let response = OpenRouterResponseParser.Response.text(content)

        let result = response.toAgentResponse

        #expect(result == .text(content))
    }

    // MARK: - Helpers

    private typealias AgentResponse = AgentLoop.Response
}

// MARK: - Adapter

extension OpenRouterResponseParser.Response {

    var toAgentResponse: AgentLoop.Response {
        switch self {
        case .text(let content): .text(content)
        case .toolCalls: .text("")
        }
    }
}
