import Recording

/// Records each call and holds it until the test answers; answering waits for the call.
/// Waiting ends when the test is cancelled, so a call that never comes fails at the time limit.
actor CallSpy<Answer: Sendable> {

    private(set) var count = 0
    private var pending: [CheckedContinuation<Answer, Never>] = []
    private let changed = AsyncStream<Void>.makeStream()

    func call() async -> Answer {

        count += 1
        return await withCheckedContinuation { continuation in
            pending.append(continuation)
            changed.continuation.yield(())
        }
    }

    /// Returns once a call is held, or when the test is cancelled.
    func waitForCall() async {

        var iterator = changed.stream.makeAsyncIterator()
        while pending.isEmpty {
            guard await iterator.next() != nil else { return }
        }
    }

    func complete(with answer: Answer) async {

        await waitForCall()
        guard !pending.isEmpty else { return }
        pending.removeFirst().resume(returning: answer)
    }
}

extension CallSpy where Answer == Void {

    func complete() async { await complete(with: ()) }
}
