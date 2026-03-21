import Testing

final class AgentLoopTests: TestContext {

    @Test func test_process_shouldCallRespondWithUserQuery() async throws {

        let query = makeSomeString()
        let (sut, respond) = makeSUT()

        _ = try await sut.process(query)

        #expect(respond.payloads == [query])
    }

    // MARK: - Helpers

    private typealias SUT = AgentLoop
    private typealias RespondSpy = AsyncSpy<String, Void, Never>

    private func makeSUT(
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (SUT, RespondSpy) {

        let respond = RespondSpy(stubs: [.success(())])
        let sut = SUT(respond: respond.call(payload:))
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        trackForMemoryLeaks(respond, sourceLocation: sourceLocation)
        return (sut, respond)
    }
}

// MARK: - AgentLoop

private final class AgentLoop {

    typealias Respond = (String) async throws -> Void

    private let respond: Respond

    init(respond: @escaping Respond) {
        self.respond = respond
    }

    func process(_ input: String) async throws -> String {
        try await respond(input)
        return ""
    }
}
