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
        let (agentLoop, uiInput, _) = makeSUT(expectsControl: true)

        uiInput.send(control)

        await agentLoop.waitForControl(1)
        #expect(agentLoop.receivedControls == [control])
    }

    @Test func test_shouldSwitchToControlRouting_onAgentEventFlippingState() async throws {
        let message = makeControl()
        let control = makeControl()
        let event = makeAgentEvent()
        let agentLoop = ControllableLoop(events: [event])
        let uiInput = ControlChannel()
        let envelope = agentLoop.compose(uiEvents: uiInput.stream, initial: false, map: { _ in true })

        uiInput.send(message)
        await waitForState(true, on: envelope)

        uiInput.send(control)
        await agentLoop.waitForControl(1)

        #expect(agentLoop.receivedInputs == [message])
        #expect(agentLoop.receivedControls == [control])
    }

    // MARK: - Helpers

    private typealias Loop = AgentLoopSpy<Message, AgentEvent>
    private typealias ControllableLoop = ControllableAgentLoopSpy<Control, AgentEvent>
    private typealias MessageChannel = InputChannel<Message>
    private typealias ControlChannel = InputChannel<Control>
    private typealias Envelope = StateEnvelope<AgentEvent, Bool>

    private func makeSUT(
        events: [AgentEvent],
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (Loop, MessageChannel, StreamSpy<AgentEvent>) {
        let agentLoop = Loop(events: events)
        let input = MessageChannel()
        let repl = agentLoop.compose(input: input.stream)
        return (agentLoop, input, StreamSpy(repl.run()))
    }

    private func makeSUT(
        expectsControl: Bool,
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (ControllableLoop, ControlChannel, Envelope) {
        let agentLoop = ControllableLoop()
        let uiInput = ControlChannel()
        let envelope = agentLoop.compose(uiEvents: uiInput.stream, initial: expectsControl, map: { _ in expectsControl })
        return (agentLoop, uiInput, envelope)
    }

    private func waitForState(
        _ expected: Bool,
        on envelope: Envelope,
        timeout: Duration = .seconds(2),
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) async {
        let deadline = ContinuousClock.now + timeout
        while envelope.query() != expected, ContinuousClock.now < deadline {
            await Task.yield()
        }
        #expect(envelope.query() == expected, sourceLocation: sourceLocation)
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

extension AgentLoop where Self: Sendable {

    func compose(input: AsyncStream<Input>) -> REPL<Input, Event> {
        REPL(input: input, turn: { self.run(input: $0) })
    }
}

private protocol ControllableAgentLoop<Control>: AgentLoop {
    associatedtype Control: Sendable
    func start(observing: AsyncStream<Control>)
}

extension ControllableAgentLoop where Control == Input, Control: Equatable, Self: Sendable {

    func compose(
        uiEvents: AsyncStream<Control>,
        initial: Bool = false,
        map: @escaping @Sendable (Event) -> Bool
    ) -> StateEnvelope<Event, Bool> {
        let (replStream, replContinuation) = AsyncStream.makeStream(of: Control.self)
        let (controlStream, controlContinuation) = AsyncStream.makeStream(of: Control.self)

        let repl = compose(input: replStream)
        let envelope = StateEnvelope(initial: initial, stream: repl.run(), map: map)
        let router = Router(events: uiEvents, expectsControl: { envelope.query() })

        start(observing: controlStream)

        Task {
            for await routerEvent in router.run() {
                switch routerEvent {
                case .repl(let input): replContinuation.yield(input)
                case .control(let control): controlContinuation.yield(control)
                }
            }
            replContinuation.finish()
            controlContinuation.finish()
        }

        return envelope
    }
}

private final class ControllableAgentLoopSpy<C: Equatable & Sendable, E: Equatable & Sendable>: ControllableAgentLoop, @unchecked Sendable {

    private let events: [E]
    private(set) var receivedInputs = [C]()
    private(set) var receivedControls = [C]()

    init(events: [E] = []) {
        self.events = events
    }

    func run(input: C) -> AsyncStream<E> {
        receivedInputs.append(input)
        let events = events
        return AsyncStream { continuation in
            for event in events {
                continuation.yield(event)
            }
            continuation.finish()
        }
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
