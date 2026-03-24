import Testing

final class SessionLoopTests: TestContext {

    @Test func test_shouldCaptureEscalation_onTurnRequestingApproval() async throws {
        let (_, spy) = makeSUT(steps: [.escalation("approve tool X?")])

        await spy.waitForEvents(1)
        #expect(spy.values == [Output.escalation("approve tool X?")])
    }

    @Test func test_shouldFinishWithoutSuspending_onTextOutput() async throws {
        let (_, spy) = makeSUT(steps: [.text("hello")])

        await spy.waitForFinish()
        #expect(spy.values == [Output.text("hello")])
        #expect(spy.isFinished)
    }

    @Test func test_shouldResumeAndFinish_onControlSignalAfterEscalation() async throws {
        let (control, spy) = makeSUT(steps: [.escalation("approve?")])

        await spy.waitForEvents(1)
        #expect(!spy.isFinished)

        await control.signal(makeControlResponse())

        await spy.waitForFinish()
        #expect(spy.isFinished)
    }

    @Test func test_shouldEmitRemainingOutput_onControlSignalAfterEscalation() async throws {
        let (control, spy) = makeSUT(steps: [.escalation("approve?"), .text("result")])

        await spy.waitForEvents(1)
        #expect(spy.values == [Output.escalation("approve?")])
        #expect(!spy.isFinished)

        let response = makeControlResponse()
        await control.signal(response)

        await spy.waitForFinish()
        #expect(spy.values == [Output.escalation("approve?"), Output.response(response), Output.text("result")])
        #expect(spy.isFinished)
    }

    @Test func test_shouldSuspendAndResumeEachEscalation_onMultipleEscalations() async throws {
        let (control, spy) = makeSUT(steps: [.escalation("first?"), .escalation("second?"), .text("done")])

        await spy.waitForEvents(1)
        #expect(spy.values == [Output.escalation("first?")])
        #expect(!spy.isFinished)

        let response1 = makeControlResponse()
        await control.signal(response1)

        await spy.waitForEvents(3)
        #expect(spy.values == [Output.escalation("first?"), Output.response(response1), Output.escalation("second?")])
        #expect(!spy.isFinished)

        let response2 = makeControlResponse()
        await control.signal(response2)

        await spy.waitForFinish()
        #expect(spy.values == [Output.escalation("first?"), Output.response(response1), Output.escalation("second?"), Output.response(response2), Output.text("done")])
        #expect(spy.isFinished)
    }

    @Test func test_shouldDeliverControlResponse_onEscalation() async throws {
        let response = makeControlResponse()
        let (control, spy) = makeSUT(steps: [.escalation("approve?")])

        await spy.waitForEvents(1)
        await control.signal(response)

        await spy.waitForEvents(2)
        #expect(spy.values == [Output.escalation("approve?"), Output.response(response)])
    }

    @Test func test_shouldStillSuspend_onControlSignalSentBeforeEscalation() async throws {
        let (control, spy) = makeSUT(steps: [.escalation("approve?")])

        await control.signal(makeControlResponse())

        await spy.waitForEvents(1)
        #expect(spy.values == [Output.escalation("approve?")])

        await spy.waitForEvents(2, timeout: .milliseconds(100))
        #expect(spy.values == [Output.escalation("approve?")])
        #expect(!spy.isFinished)
    }

    @Test func test_shouldStopEmitting_onCancellation() async throws {
        let (control, spy) = makeSUT(steps: [.text("first"), .text("second"), .text("third")])

        await spy.waitForEvents(1)
        await control.cancel()

        await spy.waitForFinish()
        #expect(spy.values == [Output.text("first")])
    }

    @Test func test_shouldSuspend_onEscalation() async throws {
        let (_, spy) = makeSUT(steps: [.escalation("approve?")])

        await spy.waitForEvents(1)
        #expect(spy.values == [Output.escalation("approve?")])

        await spy.waitForEvents(2, timeout: .milliseconds(100))
        #expect(spy.values == [Output.escalation("approve?")])
        #expect(!spy.isFinished)
    }

    // MARK: - Helpers

    private typealias SUT = ScriptedTurn<ControlResponse>
    private typealias Output = TurnOutput<ControlResponse>
    private typealias TurnSpy = StreamSpy<Output>

    private func makeSUT(
        steps: [Output],
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (Gate<ControlResponse>, TurnSpy) {
        let gate = Gate<ControlResponse>()
        let turn = SUT(steps: steps, gate: gate)
        return (gate, TurnSpy(turn.run()))
    }

    private struct ControlResponse: Equatable, Sendable {
        let value: String
    }

    private func makeControlResponse(
        _ value: String = makeSomeString()
    ) -> ControlResponse {
        .init(value: value)
    }
}

private enum TurnOutput<Response: Equatable & Sendable>: Equatable, Sendable {
    case escalation(String)
    case response(Response)
    case text(String)
}

private struct ScriptedTurn<Response: Equatable & Sendable> {

    let steps: [TurnOutput<Response>]
    let gate: Gate<Response>

    func run() -> AsyncStream<TurnOutput<Response>> {
        let steps = steps
        let gate = gate
        return AsyncStream { continuation in
            Task {
                for step in steps {
                    guard await !gate.isCancelled else { break }
                    continuation.yield(step)
                    if case .escalation = step {
                        let response = await gate.wait()
                        continuation.yield(.response(response))
                    }
                    try? await Task.sleep(for: .milliseconds(10))
                }
                continuation.finish()
            }
        }
    }
}

private actor Gate<Response: Sendable> {

    private var continuation: CheckedContinuation<Response, Never>?
    private(set) var isCancelled = false

    func wait() async -> Response {
        await withCheckedContinuation { continuation = $0 }
    }

    func signal(_ response: Response) {
        continuation?.resume(returning: response)
        continuation = nil
    }

    func cancel() {
        isCancelled = true
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
