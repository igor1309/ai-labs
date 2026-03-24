import Testing
@testable import NerisCore

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
        let (agentLoop, uiInput, _) = makeSUT(initial: true)

        uiInput.send(control)

        await agentLoop.waitForControl(1)
        #expect(agentLoop.receivedControls == [control])
    }

    @Test func test_shouldRouteInputThroughFullFeedbackLoop() async throws {
        let message = makeControl()
        let control = makeControl()
        let resumed = makeControl()
        let (agentLoop, uiInput, envelope) = makeSUTWithEscalation()

        uiInput.send(message)
        await waitForState(true, on: envelope)

        uiInput.send(control)
        await waitForState(false, on: envelope)

        uiInput.send(resumed)
        await agentLoop.waitForInput(2)

        #expect(agentLoop.receivedInputs == [message, resumed])
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
        events: [AgentEvent] = [],
        postControlEvents: [AgentEvent] = [],
        initial: Bool,
        map: @escaping @Sendable (AgentEvent) -> Bool = { _ in true },
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (ControllableLoop, ControlChannel, Envelope) {
        let agentLoop = ControllableLoop(events: events, postControlEvents: postControlEvents)
        let uiInput = ControlChannel()
        let envelope = agentLoop.compose(uiEvents: uiInput.stream, initial: initial, map: map)
        return (agentLoop, uiInput, envelope)
    }

    private func makeSUTWithEscalation(
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (ControllableLoop, ControlChannel, Envelope) {
        let escalation = makeAgentEvent()
        return makeSUT(
            events: [escalation],
            postControlEvents: [makeAgentEvent()],
            initial: false,
            map: { $0 == escalation }
        )
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

private final class ControllableAgentLoopSpy<Input: Equatable & Sendable, Event: Equatable & Sendable>: ControllableAgentLoop, @unchecked Sendable {

    private let events: [Event]
    private let postControlEvents: [Event]
    private let resumeStream: AsyncStream<Void>
    private let resumeContinuation: AsyncStream<Void>.Continuation
    private(set) var receivedInputs = [Input]()
    private(set) var receivedControls = [Input]()

    init(events: [Event] = [], postControlEvents: [Event] = []) {
        self.events = events
        self.postControlEvents = postControlEvents
        let (stream, continuation) = AsyncStream.makeStream(of: Void.self)
        self.resumeStream = stream
        self.resumeContinuation = continuation
    }

    func run(input: Input) -> AsyncStream<Event> {
        receivedInputs.append(input)
        let pre = events
        let post = postControlEvents
        let resume = resumeStream
        return AsyncStream { continuation in
            Task {
                for event in pre { continuation.yield(event) }
                if !post.isEmpty {
                    for await _ in resume { break }
                    for event in post { continuation.yield(event) }
                }
                continuation.finish()
            }
        }
    }

    func start(observing stream: AsyncStream<Input>) {
        Task { [weak self] in
            for await control in stream {
                self?.receivedControls.append(control)
                self?.resumeContinuation.yield(())
            }
        }
    }

    func waitForControl(_ count: Int, timeout: Duration = .seconds(2)) async {
        let deadline = ContinuousClock.now + timeout
        while receivedControls.count < count, ContinuousClock.now < deadline {
            await Task.yield()
        }
    }

    func waitForInput(_ count: Int, timeout: Duration = .seconds(2)) async {
        let deadline = ContinuousClock.now + timeout
        while receivedInputs.count < count, ContinuousClock.now < deadline {
            await Task.yield()
        }
    }
}

private final class AgentLoopSpy<Input: Equatable & Sendable, Event: Equatable & Sendable>: AgentLoop, @unchecked Sendable {

    let events: [Event]
    private(set) var receivedInputs = [Input]()

    init(events: [Event]) {
        self.events = events
    }

    func run(input: Input) -> AsyncStream<Event> {
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
