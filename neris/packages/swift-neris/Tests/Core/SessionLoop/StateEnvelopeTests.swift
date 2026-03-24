import Testing

final class StateEnvelopeTests: TestContext {

    @Test func test_shouldReportFalse_beforeAnyEvent() async throws {
        let (sut, _) = makeSUT()

        #expect(!sut.query())
    }

    @Test func test_shouldReportTrue_onEventMappingToTrue() async throws {
        let (sut, input) = makeSUT()

        input.send(Event(isAwaiting: true))
        await sut.waitForState(true)

        #expect(sut.query())
    }

    @Test func test_shouldReportFalse_onEventMappingToFalse() async throws {
        let (sut, input) = makeSUT()

        input.send(Event(isAwaiting: true))
        await sut.waitForState(true)

        input.send(Event(isAwaiting: false))
        await sut.waitForState(false)

        #expect(!sut.query())
    }

    @Test func test_shouldRetainLastState_onStreamTermination() async throws {
        let (sut, input) = makeSUT()

        input.send(Event(isAwaiting: true))
        await sut.waitForState(true)

        input.finish()
        await Task.yield()

        #expect(sut.query())
    }

    @Test func test_shouldDriveRouterRouting_onStreamStateChange() async throws {
        let (task, control) = (makeSomeString(), makeSomeString())
        let (envelope, stateInput, uiInput, spy) = makeSUT()

        uiInput.send(task)
        await spy.waitForEvents(1)

        stateInput.send(Event(isAwaiting: true))
        await envelope.waitForState(true)

        uiInput.send(control)
        await spy.waitForEvents(2)

        #expect(spy.values == [RouterEvent.repl(task), RouterEvent.control(control)])
    }

    // MARK: - Helpers

    private typealias SUT = StateEnvelope<Event>

    private func makeSUT(
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (SUT, InputChannel<Event>) {
        let input = InputChannel<Event>()
        let sut = SUT(stream: input.stream) { $0.isAwaiting }
        return (sut, input)
    }

    private func makeSUT(
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (SUT, InputChannel<Event>, InputChannel<String>, StreamSpy<RouterEvent<String>>) {
        let (envelope, stateInput) = makeSUT(sourceLocation)
        let uiInput = InputChannel<String>()
        let router = Router(events: uiInput.stream, expectsControl: { envelope.query() })
        return (envelope, stateInput, uiInput, StreamSpy(router.run()))
    }

    private struct Event: Sendable {
        let isAwaiting: Bool
    }
}

private final class StateEnvelope<Event: Sendable>: @unchecked Sendable {

    private var state = false
    private var task: Task<Void, Never>?

    init(stream: AsyncStream<Event>, reduce: @escaping @Sendable (Event) -> Bool) {
        task = Task { [weak self] in
            for await event in stream {
                self?.state = reduce(event)
            }
        }
    }

    func query() -> Bool {
        state
    }

    func waitForState(_ expected: Bool, timeout: Duration = .seconds(2)) async {
        let deadline = ContinuousClock.now + timeout
        while state != expected, ContinuousClock.now < deadline {
            await Task.yield()
        }
    }

    deinit { task?.cancel() }
}
