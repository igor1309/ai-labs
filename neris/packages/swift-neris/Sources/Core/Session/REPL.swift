public struct REPL<Input: Sendable, Event: Sendable> {

    public let input: AsyncStream<Input>
    public let turn: @Sendable (Input) -> AsyncStream<Event>

    public init(input: AsyncStream<Input>, turn: @escaping @Sendable (Input) -> AsyncStream<Event>) {
        self.input = input
        self.turn = turn
    }

    public func run() -> AsyncStream<Event> {
        let input = input
        let turn = turn
        return AsyncStream { continuation in
            Task {
                for await message in input {
                    for await output in turn(message) {
                        continuation.yield(output)
                    }
                }
                continuation.finish()
            }
        }
    }
}
