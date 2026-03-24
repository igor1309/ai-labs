import Foundation
@testable import NerisCore
import Testing

final class OpenRouterMessageAdapterTests: TestContext {

    @Test func test_toOpenRouterMessage_shouldMapUser() {

        let content = makeSomeString()

        #expect(makeMessage(.user(content)) == .user(content))
    }

    @Test func test_toOpenRouterMessage_shouldMapAssistantText() {

        let content = makeSomeString()

        #expect(makeMessage(.assistant(.text(content))) == .assistant(content))
    }

    @Test func test_toOpenRouterMessage_shouldMapAssistantToolCalls() {

        let (id, name, arguments) = (makeSomeString(), makeSomeString(), makeSomeString())
        let toolCall = ToolUseLoop.ToolCall(id: id, name: name, arguments: arguments)

        let result = makeMessage(.assistant(.toolCalls([toolCall])))

        #expect(result == .assistantToolCalls([.init(id: id, name: name, arguments: arguments)]))
    }

    @Test func test_toOpenRouterMessage_shouldMapTool() {

        let (id, content) = (makeSomeString(), makeSomeString())

        #expect(makeMessage(.tool(id: id, content: content)) == .tool(toolCallId: id, content: content))
    }

    @Test func test_toOpenRouterMessage_shouldMapError() {

        let content = makeSomeString()

        #expect(makeMessage(.error(content)) == .system(content))
    }

    @Test func test_toOpenRouterMessages_shouldMapMultiple() {

        let (query, response) = (makeSomeString(), makeSomeString())
        let messages: [ToolUseLoop.Message] = [.user(query), .assistant(.text(response))]

        #expect(messages.map(\.toOpenRouterMessage) == [.user(query), .assistant(response)])
    }

    // MARK: - Helpers

    private func makeMessage(_ message: ToolUseLoop.Message) -> OpenRouterRequestFactory.Message {

        message.toOpenRouterMessage
    }
}
