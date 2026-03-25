import Foundation

public final class ToolUseLoop: Sendable {

    protocol Store: Sendable {
        func append(_ message: Message)
        func all() -> [Message]
    }

    public struct ToolCall: Equatable, Sendable {
        public let id: String
        public let name: String
        public let arguments: String
    }

    public enum Event: Equatable, Sendable {
        case toolCall(ToolCall)
        case toolResult(String)
        case text(String)
    }

    enum Message: Equatable {
        case user(String)
        case assistant(Response)
        case tool(id: String, content: String)
        case error(String)
    }

    enum Response: Equatable {
        case text(String)
        case toolCalls([ToolCall])
    }

    typealias EventStream = AsyncThrowingStream<Event, Error>
    typealias Respond = @Sendable ([Message]) async throws -> Response
    typealias Execute = @Sendable (ToolCall) async throws -> String

    private let respond: Respond
    private let execute: Execute
    private let store: any Store

    init(respond: @escaping Respond, execute: @escaping Execute, store: any Store) {
        self.respond = respond
        self.execute = execute
        self.store = store
    }

    func process(_ input: String) -> EventStream {

        AsyncThrowingStream { continuation in
            Task {
                do {
                    try await self.run(input, continuation: continuation)
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    private func run(_ input: String, continuation: EventStream.Continuation) async throws {
        store.append(.user(input))
        while true {
            let response = try await record({ try await self.respond(self.store.all()) }, { .assistant($0) })
            switch response {
            case .text(let text):
                continuation.yield(.text(text))
                continuation.finish()
                return
            case .toolCalls(let calls):
                for call in calls {
                    continuation.yield(.toolCall(call))
                    let result = try await record(
                        { try await self.execute(call) },
                        { .tool(id: call.id, content: $0) }
                    )
                    continuation.yield(.toolResult(result))
                }
            }
        }
    }

    private func record<T>(
        _ operation: @Sendable () async throws -> T,
        _ message: @Sendable (T) -> Message
    ) async throws -> T {
        do {
            let value = try await operation()
            store.append(message(value))
            return value
        } catch {
            store.append(.error(error.localizedDescription))
            throw error
        }
    }
}
