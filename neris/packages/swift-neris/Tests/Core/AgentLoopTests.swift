import Testing

final class AgentLoopTests: TestContext {

    @Test func test_process_shouldCallRespondWithUserQuery() async throws {

        let query = makeSomeString()
        let (sut, respond, _) = makeSUT()

        _ = try await sut.process(query)

        #expect(respond.payloads == [query])
    }

    @Test func test_process_shouldReturnRespondResult() async throws {

        let expected = makeSomeString()
        let (sut, _, _) = makeSUT(respondStubs: [expected])

        let result = try await sut.process(makeSomeString())

        #expect(result == expected)
    }

    @Test func test_process_shouldCallExecuteWithToolCall() async throws {

        let toolCall = makeSomeString()
        let (sut, _, execute) = makeSUT(respondStubs: [toolCall])

        _ = try await sut.process(makeSomeString())

        #expect(execute.payloads == [toolCall])
    }

    // MARK: - Helpers

    private typealias SUT = AgentLoop
    private typealias RespondSpy = AsyncSpyOf<String, String>
    private typealias ExecuteSpy = AsyncSpy<String, Void, Never>

    private func makeSUT(
        respondStubs: [String]? = nil,
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (SUT, RespondSpy, ExecuteSpy) {

        let stubs = respondStubs ?? [makeSomeString()]
        let respond = RespondSpy(stubs: stubs.map { .success($0) })
        let execute = ExecuteSpy()
        let sut = SUT(
            respond: respond.call(payload:),
            execute: execute.callNoThrow(payload:)
        )
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        trackForMemoryLeaks(respond, sourceLocation: sourceLocation)
        trackForMemoryLeaks(execute, sourceLocation: sourceLocation)
        return (sut, respond, execute)
    }
}

// MARK: - AgentLoop

private final class AgentLoop {

    typealias Respond = (String) async throws -> String
    typealias Execute = (String) async -> Void

    private let respond: Respond
    private let execute: Execute

    init(respond: @escaping Respond, execute: @escaping Execute) {
        self.respond = respond
        self.execute = execute
    }

    func process(_ input: String) async throws -> String {
        let response = try await respond(input)
        await execute(response)
        return response
    }
}
