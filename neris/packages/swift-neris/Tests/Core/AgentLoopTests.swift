import Foundation
import Testing

final class AgentLoopTests: TestContext {

    @Test func test_process_shouldPassUserMessageToRespond() async throws {

        let query = makeSomeString()
        let (sut, respond, _) = makeSUT(respondStubs: [.success(.text(makeSomeString()))])

        _ = try await collect(sut.process(query))

        #expect(respond.payloads.first == [.user(query)])
    }

    @Test func test_process_shouldYieldTextEvent() async throws {

        let expected = makeSomeString()
        let (sut, _, _) = makeSUT(respondStubs: [.success(.text(expected))])

        let events = try await collect(sut.process(makeSomeString()))

        #expect(events == [.text(expected)])
    }

    @Test func test_process_shouldYieldToolCallAndResultEvents() async throws {

        let (toolCall, toolResult, text) = (makeSomeString(), makeSomeString(), makeSomeString())
        let (sut, _, _) = makeSUT(
            respondStubs: [.success(.toolCall(toolCall)), .success(.text(text))],
            executeStubs: [.success(toolResult)]
        )

        let events = try await collect(sut.process(makeSomeString()))

        #expect(events == [.toolCall(toolCall), .toolResult(toolResult), .text(text)])
    }

    @Test func test_process_shouldCallExecuteWithToolCall() async throws {

        let toolCall = makeSomeString()
        let (sut, _, execute) = makeSUT(respondStubs: [.success(.toolCall(toolCall)), .success(.text(makeSomeString()))])

        _ = try await collect(sut.process(makeSomeString()))

        #expect(execute.payloads == [toolCall])
    }

    @Test func test_process_shouldNotCallExecute_onTextResponse() async throws {

        let (sut, _, execute) = makeSUT(respondStubs: [.success(.text(makeSomeString()))])

        _ = try await collect(sut.process(makeSomeString()))

        #expect(execute.callCount == 0)
    }

    @Test func test_process_shouldLoopOnMultipleToolCalls() async throws {

        let (toolCall1, toolCall2) = (makeSomeString(), makeSomeString())
        let (sut, _, execute) = makeSUT(
            respondStubs: [.success(.toolCall(toolCall1)), .success(.toolCall(toolCall2)), .success(.text(makeSomeString()))],
            executeStubs: [.success(makeSomeString()), .success(makeSomeString())]
        )

        _ = try await collect(sut.process(makeSomeString()))

        #expect(execute.payloads == [toolCall1, toolCall2])
    }

    @Test func test_process_shouldStopLooping_onTextResponse() async throws {

        let (sut, _, execute) = makeSUT(
            respondStubs: [.success(.toolCall(makeSomeString())), .success(.text(makeSomeString())), .success(.toolCall(makeSomeString()))],
            executeStubs: [.success(makeSomeString()), .success(makeSomeString())]
        )

        _ = try await collect(sut.process(makeSomeString()))

        #expect(execute.callCount == 1)
    }

    @Test func test_process_shouldPropagateRespondError() async throws {

        let error = makeSomeError(domain: makeSomeString())
        let (sut, _, _) = makeSUT(respondStubs: [.failure(error)])

        await #expect {
            _ = try await self.collect(sut.process(makeSomeString()))
        } throws: {
            ($0 as NSError).domain == (error as NSError).domain
        }
    }

    @Test func test_process_shouldPropagateExecuteError() async throws {

        let error = makeSomeError(domain: makeSomeString())
        let (sut, _, _) = makeSUT(
            respondStubs: [.success(.toolCall(makeSomeString()))],
            executeStubs: [.failure(error)]
        )

        await #expect {
            _ = try await self.collect(sut.process(makeSomeString()))
        } throws: {
            ($0 as NSError).domain == (error as NSError).domain
        }
    }

    @Test func test_process_shouldPropagateRespondError_afterExecute() async throws {

        let error = makeSomeError(domain: makeSomeString())
        let (sut, _, _) = makeSUT(
            respondStubs: [.success(.toolCall(makeSomeString())), .failure(error)],
            executeStubs: [.success(makeSomeString())]
        )

        await #expect {
            _ = try await self.collect(sut.process(makeSomeString()))
        } throws: {
            ($0 as NSError).domain == (error as NSError).domain
        }
    }

    @Test func test_process_shouldPassToolCallAndResultToRespond() async throws {

        let (query, toolCall, toolResult) = (makeSomeString(), makeSomeString(), makeSomeString())
        let (sut, respond, _) = makeSUT(
            respondStubs: [.success(.toolCall(toolCall)), .success(.text(makeSomeString()))],
            executeStubs: [.success(toolResult)]
        )

        _ = try await collect(sut.process(query))

        #expect(respond.payloads == [
            [.user(query)],
            [.user(query), .assistant(.toolCall(toolCall)), .tool(toolResult)]
        ])
    }

    @Test func test_process_shouldPassPreviousTurnHistory_onSecondCall() async throws {

        let (query1, response1, query2) = (makeSomeString(), makeSomeString(), makeSomeString())
        let (sut, respond, _) = makeSUT(respondStubs: [.success(.text(response1)), .success(.text(makeSomeString()))])

        _ = try await collect(sut.process(query1))
        _ = try await collect(sut.process(query2))

        #expect(respond.payloads.last == [
            .user(query1),
            .assistant(.text(response1)),
            .user(query2)
        ])
    }

    @Test func test_process_shouldPassToolCallHistory_onSecondCall() async throws {

        let (query1, toolCall, toolResult, textResponse, query2) =
            (makeSomeString(), makeSomeString(), makeSomeString(), makeSomeString(), makeSomeString())
        let (sut, respond, _) = makeSUT(
            respondStubs: [.success(.toolCall(toolCall)), .success(.text(textResponse)), .success(.text(makeSomeString()))],
            executeStubs: [.success(toolResult)]
        )

        _ = try await collect(sut.process(query1))
        _ = try await collect(sut.process(query2))

        #expect(respond.payloads.last == [
            .user(query1),
            .assistant(.toolCall(toolCall)),
            .tool(toolResult),
            .assistant(.text(textResponse)),
            .user(query2)
        ])
    }

    @Test func test_process_shouldRecordError_onRespondFailure() async throws {

        let (query1, query2) = (makeSomeString(), makeSomeString())
        let error = makeSomeError(domain: makeSomeString())
        let (sut, respond, _) = makeSUT(respondStubs: [.failure(error), .success(.text(makeSomeString()))])

        _ = try? await collect(sut.process(query1))
        _ = try await collect(sut.process(query2))

        #expect(respond.payloads.last == [
            .user(query1),
            .error(error.localizedDescription),
            .user(query2)
        ])
    }

    @Test func test_process_shouldRecordError_onExecuteFailure() async throws {

        let (query1, toolCall, query2) = (makeSomeString(), makeSomeString(), makeSomeString())
        let error = makeSomeError(domain: makeSomeString())
        let (sut, respond, _) = makeSUT(
            respondStubs: [.success(.toolCall(toolCall)), .success(.text(makeSomeString()))],
            executeStubs: [.failure(error)]
        )

        _ = try? await collect(sut.process(query1))
        _ = try await collect(sut.process(query2))

        #expect(respond.payloads.last == [
            .user(query1),
            .assistant(.toolCall(toolCall)),
            .error(error.localizedDescription),
            .user(query2)
        ])
    }

    // MARK: - Helpers

    private typealias SUT = AgentLoop
    private typealias RespondSpy = AsyncSpyOf<[SUT.Message], SUT.Response>
    private typealias ExecuteSpy = AsyncSpyOf<String, String>

    private func makeSUT(
        respondStubs: [RespondSpy.Stub]? = nil,
        executeStubs: [ExecuteSpy.Stub]? = nil,
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (SUT, RespondSpy, ExecuteSpy) {

        let respond = RespondSpy(stubs: respondStubs ?? [.success(.toolCall(makeSomeString())), .success(.text(makeSomeString()))])
        let execute = ExecuteSpy(stubs: executeStubs ?? [.success(makeSomeString())])
        let sut = SUT(
            respond: respond.call(payload:),
            execute: execute.call(payload:)
        )
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        trackForMemoryLeaks(respond, sourceLocation: sourceLocation)
        trackForMemoryLeaks(execute, sourceLocation: sourceLocation)
        return (sut, respond, execute)
    }

    private func collect(_ stream: SUT.EventStream) async throws -> [SUT.Event] {

        var events = [SUT.Event]()
        for try await event in stream {
            events.append(event)
        }
        return events
    }
}

// MARK: - AgentLoop

private actor AgentLoop {

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
