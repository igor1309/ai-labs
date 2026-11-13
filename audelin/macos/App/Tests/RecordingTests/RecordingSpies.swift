import Recording

/// Keeps each sent event until the test takes it; taking waits for one.
actor SendSpy {

    private var events: [RecordingEvent] = []
    private let changed = AsyncStream<Void>.makeStream()

    var count: Int { events.count }

    func send(_ event: RecordingEvent) {

        events.append(event)
        changed.continuation.yield(())
    }

    func next() async -> RecordingEvent {

        while events.isEmpty {
            var iterator = changed.stream.makeAsyncIterator()
            guard await iterator.next() != nil else { return .sessionReported(id: 0, .ended) }
        }
        return events.removeFirst()
    }
}

/// Holds each call until the test completes it; completing waits for the call.
actor SessionSpy: RecordingSession {

    private(set) var beginIDs: [UInt64] = []
    private(set) var endIDs: [UInt64] = []
    private(set) var endReturned = false
    private var pendingBegins: [AsyncStream<RecordingSessionReport>.Continuation] = []
    private var pendingEnds: [AsyncStream<Void>.Continuation] = []
    private let changed = AsyncStream<Void>.makeStream()

    func begin(id: UInt64) async -> RecordingSessionReport {

        beginIDs.append(id)
        let (stream, continuation) = AsyncStream<RecordingSessionReport>.makeStream()
        pendingBegins.append(continuation)
        wakeWaiters()
        for await report in stream { return report }
        return .ended
    }

    func end(id: UInt64) async {

        endIDs.append(id)
        let (stream, continuation) = AsyncStream<Void>.makeStream()
        pendingEnds.append(continuation)
        wakeWaiters()
        for await _ in stream { break }
        endReturned = true
    }

    func completeBegin(with report: RecordingSessionReport) async {

        while pendingBegins.isEmpty {
            var iterator = changed.stream.makeAsyncIterator()
            guard await iterator.next() != nil else { return }
        }
        let continuation = pendingBegins.removeFirst()
        continuation.yield(report)
        continuation.finish()
    }

    func waitForEnd() async {

        while pendingEnds.isEmpty {
            var iterator = changed.stream.makeAsyncIterator()
            guard await iterator.next() != nil else { return }
        }
    }

    func completeEnd() async {

        await waitForEnd()
        guard !pendingEnds.isEmpty else { return }
        let continuation = pendingEnds.removeFirst()
        continuation.yield(())
        continuation.finish()
    }

    private func wakeWaiters() {

        changed.continuation.yield(())
    }
}

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
