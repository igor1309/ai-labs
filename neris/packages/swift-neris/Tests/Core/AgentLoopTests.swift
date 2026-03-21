import Foundation
import Testing

final class AgentLoopTests: TestContext {

    @Test func test_process_shouldPassUserMessageToRespond() async throws {

        let query = makeSomeString()
        let (sut, respond, _) = makeSUT()

        _ = try await sut.process(query)

        #expect(respond.payloads.first == [.user(query)])
    }

    @Test func test_process_shouldReturnRespondResult() async throws {

        let expected = makeSomeString()
        let (sut, _, _) = makeSUT(respondStubs: [.toolCall(makeSomeString()), .text(expected)])

        let result = try await sut.process(makeSomeString())

        #expect(result == expected)
    }

    @Test func test_process_shouldCallExecuteWithToolCall() async throws {

        let toolCall = makeSomeString()
        let (sut, _, execute) = makeSUT(respondStubs: [.toolCall(toolCall), .text(makeSomeString())])

        _ = try await sut.process(makeSomeString())

        #expect(execute.payloads == [toolCall])
    }

    @Test func test_process_shouldNotCallExecute_onTextResponse() async throws {

        let (sut, _, execute) = makeSUT(respondStubs: [.text(makeSomeString())])

        _ = try await sut.process(makeSomeString())

        #expect(execute.callCount == 0)
    }

    @Test func test_process_shouldLoopOnMultipleToolCalls() async throws {

        let (toolCall1, toolCall2) = (makeSomeString(), makeSomeString())
        let (sut, _, execute) = makeSUT(
            respondStubs: [.toolCall(toolCall1), .toolCall(toolCall2), .text(makeSomeString())],
            executeStubs: [makeSomeString(), makeSomeString()]
        )

        _ = try await sut.process(makeSomeString())

        #expect(execute.payloads == [toolCall1, toolCall2])
    }

    @Test func test_process_shouldStopLooping_onTextResponse() async throws {

        let (sut, _, execute) = makeSUT(
            respondStubs: [.toolCall(makeSomeString()), .text(makeSomeString()), .toolCall(makeSomeString())],
            executeStubs: [makeSomeString(), makeSomeString()]
        )

        _ = try await sut.process(makeSomeString())

        #expect(execute.callCount == 1)
    }

    @Test func test_process_shouldPropagateRespondError() async throws {

        let error = makeSomeError()
        let respond = RespondSpy(stubs: [.failure(error)])
        let execute = ExecuteSpy(stubs: [])
        let sut = SUT(respond: respond.call(payload:), execute: execute.call(payload:))

        await #expect {
            _ = try await sut.process(makeSomeString())
        } throws: {
            ($0 as NSError) === (error as NSError)
        }
    }

    @Test func test_process_shouldPropagateExecuteError() async throws {

        let error = makeSomeError()
        let respond = RespondSpy(stubs: [.success(.toolCall(makeSomeString()))])
        let execute = ExecuteSpy(stubs: [.failure(error)])
        let sut = SUT(respond: respond.call(payload:), execute: execute.call(payload:))

        await #expect {
            _ = try await sut.process(makeSomeString())
        } throws: {
            ($0 as NSError) === (error as NSError)
        }
    }

    @Test func test_process_shouldPropagateRespondError_afterExecute() async throws {

        let error = makeSomeError()
        let respond = RespondSpy(stubs: [.success(.toolCall(makeSomeString())), .failure(error)])
        let execute = ExecuteSpy(stubs: [.success(makeSomeString())])
        let sut = SUT(respond: respond.call(payload:), execute: execute.call(payload:))

        await #expect {
            _ = try await sut.process(makeSomeString())
        } throws: {
            ($0 as NSError) === (error as NSError)
        }
    }

    @Test func test_process_shouldCallRespondWithExecuteResult() async throws {

        let (query, executeResult) = (makeSomeString(), makeSomeString())
        let (sut, respond, _) = makeSUT(
            respondStubs: [.toolCall(makeSomeString()), .text(makeSomeString())],
            executeStubs: [executeResult]
        )

        _ = try await sut.process(query)

        #expect(respond.callCount == 2)
    }

    // MARK: - Helpers

    private typealias SUT = AgentLoop
    private typealias RespondSpy = AsyncSpyOf<[SUT.Message], SUT.Response>
    private typealias ExecuteSpy = AsyncSpyOf<String, String>

    private func makeSUT(
        respondStubs: [SUT.Response]? = nil,
        executeStubs: [String]? = nil,
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (SUT, RespondSpy, ExecuteSpy) {

        let stubs = respondStubs ?? [.toolCall(makeSomeString()), .text(makeSomeString())]
        let respond = RespondSpy(stubs: stubs.map { .success($0) })
        let eStubs = executeStubs ?? [makeSomeString()]
        let execute = ExecuteSpy(stubs: eStubs.map { .success($0) })
        let sut = SUT(
            respond: respond.call(payload:),
            execute: execute.call(payload:)
        )
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        trackForMemoryLeaks(respond, sourceLocation: sourceLocation)
        trackForMemoryLeaks(execute, sourceLocation: sourceLocation)
        return (sut, respond, execute)
    }
}

// MARK: - AgentLoop

private final class AgentLoop {

    enum Message: Equatable {
        case user(String)
    }

    enum Response {
        case text(String)
        case toolCall(String)
    }

    typealias Respond = ([Message]) async throws -> Response
    typealias Execute = (String) async throws -> String

    private let respond: Respond
    private let execute: Execute

    init(respond: @escaping Respond, execute: @escaping Execute) {
        self.respond = respond
        self.execute = execute
    }

    func process(_ input: String) async throws -> String {
        var current = input
        while true {
            switch try await respond([.user(current)]) {
            case .text(let text):
                return text
            case .toolCall(let call):
                current = try await execute(call)
            }
        }
    }
}
