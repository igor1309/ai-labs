import Testing

final class CompositionTests: TestContext {

    @Test func test_shouldCallRunAndForwardEvents_onInput() async throws {
        let event = makeAgentEvent()
        let message = makeMessage()
        let (_, input, spy) = makeSUT(events: [event])

        input.send(message)
        input.finish()

        await spy.waitForFinish()
        #expect(spy.values == [event])
    }

    @Test func test_shouldPassInputToAgentLoop_onInput() async throws {
        let message = makeMessage()
        let (agentLoop, input, spy) = makeSUT(events: [makeAgentEvent()])

        input.send(message)
        input.finish()

        await spy.waitForFinish()
        #expect(agentLoop.receivedInputs == [message])
    }

    @Test func test_shouldDeliverControlToAgentLoop_onControlRoute() async throws {
        let control = makeControl()
        let (agentLoop, uiInput) = makeSUT(expectsControl: true)

        uiInput.send(control)

        await agentLoop.waitForControl(1)
        #expect(agentLoop.receivedControls == [control])
    }

    // MARK: - Helpers

    private typealias Loop = AgentLoopSpy<Message, AgentEvent>
    private typealias ControllableLoop = ControllableAgentLoopSpy<Control, AgentEvent>

    private func makeSUT(
        events: [AgentEvent],
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (Loop, InputChannel<Message>, StreamSpy<AgentEvent>) {
        let agentLoop = Loop(events: events)
        let input = InputChannel<Message>()
        let repl = REPL(input: input.stream, agentLoop: agentLoop)
        return (agentLoop, input, StreamSpy(repl.run()))
    }

    private func makeSUT(
        expectsControl: Bool,
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (ControllableLoop, InputChannel<Control>) {
        let agentLoop = ControllableLoop()
        let envelope = StateEnvelope(initial: expectsControl, stream: agentLoop.events) { _ in expectsControl }
        let uiInput = InputChannel<Control>()
        let router = Router(events: uiInput.stream, expectsControl: { envelope.query() })
        agentLoop.start(observing: router.controlStream())
        return (agentLoop, uiInput)
    }

    private struct Message: Equatable, Sendable {
        let value: String
    }

    private struct AgentEvent: Equatable, Sendable {
        let value: String
    }

    private struct Control: Equatable, Sendable {
        let value: String
    }

    private func makeMessage(_ value: String = makeSomeString()) -> Message {
        .init(value: value)
    }

    private func makeAgentEvent(_ value: String = makeSomeString()) -> AgentEvent {
        .init(value: value)
    }

    private func makeControl(_ value: String = makeSomeString()) -> Control {
        .init(value: value)
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

private final class ControllableAgentLoopSpy<C: Equatable & Sendable, E: Equatable & Sendable>: ControllableAgentLoop, @unchecked Sendable {

    private(set) var receivedControls = [C]()
    private let eventChannel = InputChannel<E>()
    var events: AsyncStream<E> { eventChannel.stream }

    func run(input: C) -> AsyncStream<E> {
        AsyncStream { $0.finish() }
    }

    func start(observing stream: AsyncStream<C>) {
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

private final class AgentLoopSpy<I: Equatable & Sendable, E: Equatable & Sendable>: AgentLoop, @unchecked Sendable {

    let events: [E]
    private(set) var receivedInputs = [I]()

    init(events: [E]) {
        self.events = events
    }

    func run(input: I) -> AsyncStream<E> {
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
