import Foundation

actor AgentLoop {

    enum Event: Equatable {
        case toolCall(String)
        case toolResult(String)
        case text(String)
    }

    enum Message: Equatable {
        case user(String)
        case assistant(Response)
        case tool(String)
        case error(String)
    }

    enum Response: Equatable {
        case text(String)
        case toolCall(String)
    }

    struct ConcurrentAccessError: Error {}

    typealias EventStream = AsyncThrowingStream<Event, Error>
    typealias Respond = @Sendable ([Message]) async throws -> Response
    typealias Execute = @Sendable (String) async throws -> String

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
        guard !isProcessing else { throw ConcurrentAccessError() }
        isProcessing = true
        defer { isProcessing = false }
        messages.append(.user(input))
        while true {
            let response = try await record({ try await self.respond(messages) }, { .assistant($0) })
            switch response {
            case .text(let text):
                continuation.yield(.text(text))
                continuation.finish()
                return
            case .toolCall(let call):
                continuation.yield(.toolCall(call))
                let result = try await record({ try await self.execute(call) }, { .tool($0) })
                continuation.yield(.toolResult(result))
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
