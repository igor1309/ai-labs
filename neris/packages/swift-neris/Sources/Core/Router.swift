public enum RouterEvent<Input: Equatable & Sendable>: Equatable, Sendable {
    case repl(Input)
    case control(Input)
}

public struct Router<Input: Equatable & Sendable> {

    public let events: AsyncStream<Input>
    public let expectsControl: @Sendable () -> Bool

    public init(events: AsyncStream<Input>, expectsControl: @escaping @Sendable () -> Bool) {
        self.events = events
        self.expectsControl = expectsControl
    }

    public func run() -> AsyncStream<RouterEvent<Input>> {
        let events = events
        let expectsControl = expectsControl
        return AsyncStream { continuation in
            Task {
                for await event in events {
                    continuation.yield(expectsControl() ? .control(event) : .repl(event))
                }
                continuation.finish()
            }
        }
    }
}
