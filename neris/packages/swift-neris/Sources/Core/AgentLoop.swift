public protocol AgentLoop<Input, Event> {
    associatedtype Input: Sendable
    associatedtype Event: Sendable
    func run(input: Input) -> AsyncStream<Event>
}

extension AgentLoop where Self: Sendable {

    public func compose(input: AsyncStream<Input>) -> REPL<Input, Event> {
        REPL(input: input, turn: { self.run(input: $0) })
    }
}

public protocol ControllableAgentLoop<Control>: AgentLoop {
    associatedtype Control: Sendable
    func start(observing: AsyncStream<Control>)
}

extension ControllableAgentLoop where Control == Input, Control: Equatable, Self: Sendable {

    public func compose(
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
