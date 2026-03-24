import Testing

final class AgentLoopProtocolTests: TestContext {

    @Test func test_shouldCallRunAndForwardEvents_onInput() async throws {
        let (event, message) = (makeSomeString(), makeSomeString())
        let (input, spy) = makeSUT(events: [event])

        input.send(message)
        input.finish()

        await spy.waitForFinish()
        #expect(spy.values == [event])
    }

    // MARK: - Helpers

    private typealias SUT = REPL<String, String>

    private func makeSUT(
        events: [String],
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (InputChannel<String>, StreamSpy<String>) {
        let agentLoop = AgentLoopSpy(events: events)
        let input = InputChannel<String>()
        let sut = SUT(input: input.stream, agentLoop: agentLoop)
        return (input, StreamSpy(sut.run()))
    }
}

private protocol AgentLoop<Input, Event> {
    associatedtype Input: Sendable
    associatedtype Event: Sendable
    func run(input: Input) -> AsyncStream<Event>
}

extension REPL {

    fileprivate init<A: AgentLoop & Sendable>(input: AsyncStream<Input>, agentLoop: A) where A.Input == Input, A.Event == Event {
        self.init(input: input, turn: { agentLoop.run(input: $0) })
    }
}

private final class AgentLoopSpy: AgentLoop, Sendable {

    let events: [String]

    init(events: [String]) {
        self.events = events
    }

    func run(input: String) -> AsyncStream<String> {
        let events = events
        return AsyncStream { continuation in
            for event in events {
                continuation.yield(event)
            }
            continuation.finish()
        }
    }
}
