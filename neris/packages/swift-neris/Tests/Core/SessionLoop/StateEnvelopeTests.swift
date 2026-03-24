import Testing

final class StateEnvelopeTests: TestContext {

    @Test func test_shouldReportTrue_onEventMappingToTrue() async throws {
        let input = InputChannel<Event>()
        let sut = StateEnvelope(stream: input.stream) { $0.isAwaiting }

        input.send(Event(isAwaiting: true))
        await sut.waitForState(true)

        #expect(sut.query())
    }

    @Test func test_shouldReportFalse_onEventMappingToFalse() async throws {
        let input = InputChannel<Event>()
        let sut = StateEnvelope(stream: input.stream) { $0.isAwaiting }

        input.send(Event(isAwaiting: true))
        await sut.waitForState(true)

        input.send(Event(isAwaiting: false))
        await sut.waitForState(false)

        #expect(!sut.query())
    }

    // MARK: - Helpers

    private typealias SUT = StateEnvelope<Event>

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
