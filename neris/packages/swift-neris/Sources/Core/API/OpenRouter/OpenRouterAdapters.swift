extension ToolUseLoop.Message {

    var toOpenRouterMessage: OpenRouterRequestFactory.Message {
        switch self {
        case .user(let content): .user(content)
        case .assistant(.text(let content)): .assistant(content)
        case .assistant(.toolCalls(let calls)): .assistantToolCalls(calls.map { .init(id: $0.id, name: $0.name, arguments: $0.arguments) })
        case .tool(let id, let content): .tool(toolCallId: id, content: content)
        case .error(let content): .system(content)
        }
    }
}

extension OpenRouterResponseParser.Response {

    var toAgentResponse: ToolUseLoop.Response {
        switch self {
        case .text(let content): .text(content)
        case .toolCalls(let toolCalls): .toolCalls(toolCalls.map { .init(id: $0.id, name: $0.name, arguments: $0.arguments) })
        }
    }
}
