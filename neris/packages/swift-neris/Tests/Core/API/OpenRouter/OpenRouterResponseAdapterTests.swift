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

        let result = makeResponse(.toolCalls([first, second]))

        guard case .toolCalls(let calls) = result else {
            Issue.record("Expected .toolCalls, got \(result)")
            return
        }
        #expect(calls.map(\.id) == [first.id, second.id])
        #expect(calls.map(\.name) == [first.name, second.name])
        #expect(calls.map(\.arguments) == [first.arguments, second.arguments])
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
