import Testing

final class CompositionTests: TestContext {

    @Test func test_shouldCallRunAndForwardEvents_onInput() async throws {
        let (event, message) = (makeSomeString(), makeSomeString())
        let (_, input, spy) = makeSUT(events: [event])

        input.send(message)
        input.finish()

        await spy.waitForFinish()
        #expect(spy.values == [event])
    }

    @Test func test_shouldPassInputToAgentLoop_onInput() async throws {
        let message = makeSomeString()
        let (agentLoop, input, spy) = makeSUT(events: [makeSomeString()])

        input.send(message)
        input.finish()

        await spy.waitForFinish()
        #expect(agentLoop.receivedInputs == [message])
    }

    // MARK: - Helpers

    private typealias SUT = REPL<String, String>

    private func makeSUT(
        events: [String],
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (AgentLoopSpy, InputChannel<String>, StreamSpy<String>) {
        let agentLoop = AgentLoopSpy(events: events)
        let input = InputChannel<String>()
        let sut = SUT(input: input.stream, agentLoop: agentLoop)
        return (agentLoop, input, StreamSpy(sut.run()))
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

private final class AgentLoopSpy: AgentLoop, @unchecked Sendable {

    let events: [String]
    private(set) var receivedInputs = [String]()

    init(events: [String]) {
        self.events = events
    }

    func run(input: String) -> AsyncStream<String> {
        receivedInputs.append(input)
        let events = events
        return AsyncStream { continuation in
            for event in events {
                continuation.yield(event)
            }
            continuation.finish()
        }
    }
}
