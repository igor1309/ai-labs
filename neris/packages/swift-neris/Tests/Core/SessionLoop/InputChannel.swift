struct InputChannel<Input: Sendable> {

    let stream: AsyncStream<Input>
    private let continuation: AsyncStream<Input>.Continuation

    init() {
        let (stream, continuation) = AsyncStream.makeStream(of: Input.self)
        self.stream = stream
        self.continuation = continuation
    }

    func send(_ value: Input) {
        continuation.yield(value)
    }

    func finish() {
        continuation.finish()
    }
}
