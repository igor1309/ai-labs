import Testing

final class AgentLoopTests: TestContext {

    @Test func test_process_shouldCallRespondWithUserQuery() async throws {

        let query = makeSomeString()
        let (sut, respond) = makeSUT()

        _ = try await sut.process(query)

        #expect(respond.payloads == [query])
    }

    @Test func test_process_shouldReturnRespondResult() async throws {

        let expected = makeSomeString()
        let (sut, _) = makeSUT(respondStubs: [expected])

        let result = try await sut.process(makeSomeString())

        #expect(result == expected)
    }

    // MARK: - Helpers

    private typealias SUT = AgentLoop
    private typealias RespondSpy = AsyncSpyOf<String, String>

    private func makeSUT(
        respondStubs: [String]? = nil,
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (SUT, RespondSpy) {

        let stubs = respondStubs ?? [makeSomeString()]
        let respond = RespondSpy(stubs: stubs.map { .success($0) })
        let sut = SUT(respond: respond.call(payload:))
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        trackForMemoryLeaks(respond, sourceLocation: sourceLocation)
        return (sut, respond)
    }
}

// MARK: - AgentLoop

private final class AgentLoop {

    typealias Respond = (String) async throws -> String

    private let respond: Respond

    init(respond: @escaping Respond) {
        self.respond = respond
    }

    func process(_ input: String) async throws -> String {
        try await respond(input)
    }
}
