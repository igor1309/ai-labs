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

    @Test func test_shouldDeliverControlToAgentLoop_onControlRoute() async throws {
        let control = makeSomeString()
        let (agentLoop, uiInput) = makeSUT(expectsControl: true)

        uiInput.send(control)

        await agentLoop.waitForControl(1)
        #expect(agentLoop.receivedControls == [control])
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

    private func makeSUT(
        expectsControl: Bool,
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (ControllableAgentLoopSpy, InputChannel<String>) {
        let agentLoop = ControllableAgentLoopSpy()
        let envelope = StateEnvelope(initial: expectsControl, stream: agentLoop.events) { _ in expectsControl }
        let uiInput = InputChannel<String>()
        let router = Router(events: uiInput.stream, expectsControl: { envelope.query() })
        agentLoop.start(observing: router.controlStream())
        return (agentLoop, uiInput)
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

private protocol ControllableAgentLoop<Control>: AgentLoop {
    associatedtype Control: Sendable
    func start(observing: AsyncStream<Control>)
}

extension Router {

    func controlStream() -> AsyncStream<Input> {
        let source = run()
        return AsyncStream { continuation in
            Task {
                for await event in source {
                    if case .control(let value) = event {
                        continuation.yield(value)
                    }
                }
                continuation.finish()
            }
        }
    }
}

private final class ControllableAgentLoopSpy: ControllableAgentLoop, @unchecked Sendable {

    private(set) var receivedControls = [String]()
    private let eventChannel = InputChannel<String>()
    var events: AsyncStream<String> { eventChannel.stream }

    func run(input: String) -> AsyncStream<String> {
        AsyncStream { $0.finish() }
    }

    func start(observing stream: AsyncStream<String>) {
        Task { [weak self] in
            for await control in stream {
                self?.receivedControls.append(control)
            }
        }
    }

    func waitForControl(_ count: Int, timeout: Duration = .seconds(2)) async {
        let deadline = ContinuousClock.now + timeout
        while receivedControls.count < count, ContinuousClock.now < deadline {
            await Task.yield()
        }
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
