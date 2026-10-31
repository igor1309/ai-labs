import Foundation

public actor ToolUseLoop {

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

    struct ConcurrentAccessError: Error {}

    typealias EventStream = AsyncThrowingStream<Event, Error>
    typealias Respond = @Sendable ([Message]) async throws -> Response
    typealias Execute = @Sendable (ToolCall) async throws -> String

    private let respond: Respond
    private let execute: Execute
    private var messages = [Message]()
    private var isProcessing = false

    init(respond: @escaping Respond, execute: @escaping Execute) {
        self.respond = respond
        self.execute = execute
    }

    func process(_ input: String) -> EventStream {

        AsyncThrowingStream { continuation in
            let producer = Task {
                try await self.run(input, continuation: continuation)
            }
            // Stream completion also means the producer has unwound its actor
            // state and released its captured collaborators.
            Task.detached {
                do {
                    try await producer.value
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    private func run(_ input: String, continuation: EventStream.Continuation) async throws {
        guard !isProcessing else { throw ConcurrentAccessError() }
        isProcessing = true
        defer { isProcessing = false }
        messages.append(.user(input))
        while true {
            let response = try await record({ try await self.respond(messages) }, { .assistant($0) })
            switch response {
            case .text(let text):
                continuation.yield(.text(text))
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
            messages.append(message(value))
            return value
        } catch {
            messages.append(.error(error.localizedDescription))
            throw error
        }
    }
}
