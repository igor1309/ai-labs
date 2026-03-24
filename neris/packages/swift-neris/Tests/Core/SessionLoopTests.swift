import Testing

final class SessionLoopTests: TestContext {

    @Test func test_shouldCaptureEscalation_onTurnRequestingApproval() async throws {
        let (_, spy) = makeSUT(steps: [.escalation("approve tool X?")])

        await spy.waitForEvents(1)
        #expect(spy.values == [TurnOutput.escalation("approve tool X?")])
    }

    @Test func test_shouldFinishWithoutSuspending_onTextOutput() async throws {
        let (_, spy) = makeSUT(steps: [.text("hello")])

        await spy.waitForEvents(1)
        #expect(spy.values == [TurnOutput.text("hello")])
        #expect(spy.isFinished)
    }

    @Test func test_shouldResumeAndFinish_onControlSignalAfterEscalation() async throws {
        let (control, spy) = makeSUT(steps: [.escalation("approve?")])

        await spy.waitForEvents(1)
        #expect(!spy.isFinished)

        control.yield()

        await spy.waitForFinish()
        #expect(spy.isFinished)
    }

    @Test func test_shouldSuspend_onEscalation() async throws {
        let (_, spy) = makeSUT(steps: [.escalation("approve?")])

        await spy.waitForEvents(1)
        #expect(spy.values == [TurnOutput.escalation("approve?")])

        await spy.waitForEvents(2, timeout: .milliseconds(100))
        #expect(spy.values == [TurnOutput.escalation("approve?")])
        #expect(!spy.isFinished)
    }

    // MARK: - Helpers

    private typealias ControlStream = AsyncStream<Void>
    private typealias TurnSpy = StreamSpy<TurnOutput>

    private func makeSUT(
        steps: [TurnOutput],
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (ControlStream.Continuation, TurnSpy) {
        let (controlStream, controlContinuation) = ControlStream.makeStream()
        let turn = ScriptedTurn(steps: steps, controlInput: controlStream)
        return (controlContinuation, TurnSpy(turn.run()))
    }
}

private enum TurnOutput: Equatable, Sendable {
    case escalation(String)
    case text(String)
}

private struct ScriptedTurn {

    let steps: [TurnOutput]
    let controlInput: AsyncStream<Void>

    func run() -> AsyncStream<TurnOutput> {
        let steps = steps
        let controlInput = controlInput
        return AsyncStream { continuation in
            Task {
                for step in steps {
                    continuation.yield(step)
                    if case .escalation = step {
                        var iterator = controlInput.makeAsyncIterator()
                        _ = await iterator.next()
                    }
                }
                continuation.finish()
            }
        }
    }
}

// TODO: move to helpers after battle tested
private final class StreamSpy<Element: Sendable & Equatable>: @unchecked Sendable {

    private(set) var values = [Element]()
    private(set) var isFinished = false
    private var task: Task<Void, Never>?

    init(_ stream: AsyncStream<Element>) {
        task = Task { [weak self] in
            for await value in stream {
                self?.values.append(value)
            }
            self?.isFinished = true
        }
    }

    func waitForFinish(timeout: Duration = .seconds(2)) async {
        let deadline = ContinuousClock.now + timeout
        while !isFinished, ContinuousClock.now < deadline {
            await Task.yield()
        }
    }

    func waitForEvents(_ count: Int, timeout: Duration = .seconds(2)) async {
        let deadline = ContinuousClock.now + timeout
        while values.count < count, ContinuousClock.now < deadline {
            await Task.yield()
        }
    }

    deinit { task?.cancel() }
}
