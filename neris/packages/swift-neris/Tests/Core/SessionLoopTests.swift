import Testing

final class SessionLoopTests: TestContext {

    @Test func test_shouldCaptureEscalation_onTurnRequestingApproval() async throws {
        let spy = makeSUT(steps: [.escalation("approve tool X?")])

        await spy.waitForEvents(1)
        #expect(spy.values == [TurnOutput.escalation("approve tool X?")])
    }

    // MARK: - Helpers

    private typealias TurnSpy = StreamSpy<TurnOutput>

    private func makeSUT(
        steps: [TurnOutput],
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> TurnSpy {
        let turn = ScriptedTurn(steps: steps)
        return TurnSpy(turn.run())
    }
}

private enum TurnOutput: Equatable, Sendable {
    case escalation(String)
}

private struct ScriptedTurn {

    let steps: [TurnOutput]

    func run() -> AsyncStream<TurnOutput> {
        AsyncStream { continuation in
            for step in steps {
                continuation.yield(step)
            }
            continuation.finish()
        }
    }
}

// TODO: move to helpers after battle tested
private final class StreamSpy<Element: Sendable & Equatable>: @unchecked Sendable {

    private(set) var values = [Element]()
    private var task: Task<Void, Never>?

    init(_ stream: AsyncStream<Element>) {
        task = Task { [weak self] in
            for await value in stream {
                self?.values.append(value)
            }
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
