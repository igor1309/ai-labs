@testable import Root
import Testing

@MainActor
struct DeliveringTests {
    @Test(arguments: [7, 42])
    func syncHandlerRunsBeforeTheStreamIsReturnedAndDeliversExactlyItsEvent(effect: Int) async throws {
        var handled: [Int] = []
        let stream = delivering { (effect: Int) -> String in
            handled.append(effect)
            return "\(effect)"
        }(effect)

        #expect(handled == [effect])
        #expect(try await collect(stream) == ["\(effect)"])
    }

    @Test(arguments: [7, 42])
    func handlerWithNoEventRunsBeforeTheStreamIsReturnedAndFinishesItEmpty(effect: Int) async throws {
        var handled: [Int] = []
        let stream: AsyncStream<String> = deliveringNothing { (effect: Int) in handled.append(effect) }(effect)

        #expect(handled == [effect])
        #expect(try await collect(stream) == [])
    }

    @Test func asyncHandlerStartsInlineAndEndsTheStreamWithItsEvent() async throws {
        let gate = Gate()
        let stream = delivering { (effect: Int) async -> String in
            gate.started = true
            await gate.wait()
            return "\(effect)"
        }(7)

        #expect(gate.started)
        gate.open()
        #expect(try await collect(stream) == ["7"])
    }

    @Test(arguments: [false, true])
    func asyncHandlerWithNoEventFinishesTheStreamEmpty(suspends: Bool) async throws {
        let gate = Gate()
        let stream = delivering { (_: Int) async -> String? in
            gate.started = true
            if suspends { await gate.wait() }
            return nil
        }(7)

        #expect(gate.started)
        gate.open()
        #expect(try await collect(stream) == [])
    }

    @Test func immediateAsyncHandlerDeliversItsEvent() async throws {
        let stream = delivering { (effect: Int) async -> String? in "\(effect)" }(7)

        #expect(try await collect(stream) == ["7"])
    }

    /// A consumer that stops collecting cancels the suspended handler and gets nothing;
    /// one that keeps collecting gets the event, and the handler is not cancelled.
    @Test(arguments: [true, false])
    func cancellingTheConsumerCancelsTheSuspendedHandler(cancel: Bool) async {
        let gate = Gate()
        let cancelled = AsyncStream<Bool>.makeStream()
        let stream = delivering { (effect: Int) async -> String in
            await gate.wait()
            cancelled.continuation.yield(Task.isCancelled)
            cancelled.continuation.finish()
            return "\(effect)"
        }(7)

        let consuming = Task {
            var values: [String] = []
            for await value in stream { values.append(value) }
            return values
        }
        if cancel {
            // The cancelled consumer ends the stream before the handler can resume.
            consuming.cancel()
            #expect(await consuming.value == [])
            gate.open()
        } else {
            gate.open()
            #expect(await consuming.value == ["7"])
        }
        var seen: [Bool] = []
        for await value in cancelled.stream { seen.append(value) }
        #expect(seen == [cancel])
    }

    @Test func endingTheStreamCancelsTheAsyncHandler() async {
        let gate = Gate()
        let cancelled = AsyncStream<Bool>.makeStream()
        var stream: AsyncStream<String>? = delivering { (effect: Int) async -> String in
            await gate.wait()
            cancelled.continuation.yield(Task.isCancelled)
            cancelled.continuation.finish()
            return "\(effect)"
        }(7)

        stream = nil
        _ = stream
        gate.open()
        var seen: [Bool] = []
        for await value in cancelled.stream { seen.append(value) }
        #expect(seen == [true])
    }
}

@MainActor
private final class Gate {
    var started = false
    private var waiter: CheckedContinuation<Void, Never>?
    private var isOpen = false

    func wait() async {
        if isOpen { return }
        await withCheckedContinuation { waiter = $0 }
    }

    func open() {
        isOpen = true
        waiter?.resume()
        waiter = nil
    }
}

/// Collects the whole stream, so a stream that never finishes fails instead of passing on its first event.
private func collect(_ stream: AsyncStream<String>) async throws -> [String] {
    try await withThrowingTaskGroup(of: [String]?.self) { group in
        group.addTask {
            var values: [String] = []
            for await value in stream { values.append(value) }
            return values
        }
        group.addTask {
            try await Task.sleep(for: .seconds(5))
            return nil
        }
        let first = try await group.next() ?? nil
        group.cancelAll()
        return try #require(first, "the stream did not finish")
    }
}
