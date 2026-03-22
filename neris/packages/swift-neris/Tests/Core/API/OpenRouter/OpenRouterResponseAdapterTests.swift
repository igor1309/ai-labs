import Foundation
@testable import NerisCore
import Testing

final class OpenRouterResponseAdapterTests: TestContext {

    @Test func test_toAgentResponse_shouldMapText() {

        let content = makeSomeString()

        #expect(makeResponse(.text(content)) == .text(content))
    }

    @Test func test_toAgentResponse_shouldMapToolCalls() {

        let (id, name, arguments) = (makeSomeString(), makeSomeString(), makeSomeString())
        let toolCall = OpenRouterResponseParser.ToolCallResponse(id: id, name: name, arguments: arguments)

        #expect(makeResponse(.toolCalls([toolCall])) == .toolCalls([.init(id: id, name: name, arguments: arguments)]))
    }

    @Test func test_toAgentResponse_shouldMapMultipleToolCalls() {

        let (first, second) = (
            OpenRouterResponseParser.ToolCallResponse(id: makeSomeString(), name: makeSomeString(), arguments: makeSomeString()),
            OpenRouterResponseParser.ToolCallResponse(id: makeSomeString(), name: makeSomeString(), arguments: makeSomeString())
        )

        #expect(makeResponse(.toolCalls([first, second])) == .toolCalls([
            .init(id: first.id, name: first.name, arguments: first.arguments),
            .init(id: second.id, name: second.name, arguments: second.arguments),
        ]))
    }

    // MARK: - Helpers

    private func makeResponse(_ response: OpenRouterResponseParser.Response) -> AgentLoop.Response {

        response.toAgentResponse
    }
}

// MARK: - Adapter

extension OpenRouterResponseParser.Response {

    var toAgentResponse: AgentLoop.Response {
        switch self {
        case .text(let content): .text(content)
        case .toolCalls(let toolCalls): .toolCalls(toolCalls.map { .init(id: $0.id, name: $0.name, arguments: $0.arguments) })
        }
    }
}
