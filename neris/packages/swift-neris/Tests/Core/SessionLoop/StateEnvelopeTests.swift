import Synchronization
import Testing
@testable import NerisCore

final class StateEnvelopeTests: TestContext {

    @Test func test_shouldReportFalse_beforeAnyEvent() async throws {
        let (sut, _) = makeSUT()

        #expect(!sut.query())
    }

    @Test func test_shouldReportTrue_onEventMappingToTrue() async throws {
        let (sut, input) = makeSUT()

        input.send(Event(isAwaiting: true))
        await waitForState(true, on: sut)

        #expect(sut.query())
    }

    @Test func test_shouldReportFalse_onEventMappingToFalse() async throws {
        let (sut, input) = makeSUT()

        input.send(Event(isAwaiting: true))
        await waitForState(true, on: sut)

        input.send(Event(isAwaiting: false))
        await waitForState(false, on: sut)

        #expect(!sut.query())
    }

    @Test func test_shouldRetainLastState_onStreamTermination() async throws {
        let (sut, input) = makeSUT()

        input.send(Event(isAwaiting: true))
        await waitForState(true, on: sut)

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
        await waitForState(true, on: envelope)

        uiInput.send(control)
        await spy.waitForEvents(2)

        #expect(spy.values == [RouterEvent.repl(task), RouterEvent.control(control)])
    }

    // MARK: - Helpers

    private typealias SUT = StateEnvelope<Event, Bool>

    private func makeSUT(
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (SUT, InputChannel<Event>) {
        let input = InputChannel<Event>()
        let sut = SUT(initial: false, stream: input.stream) { $0.isAwaiting }
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

    private func waitForState(
        _ expected: Bool,
        on sut: SUT,
        timeout: Duration = .seconds(2),
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) async {
        let deadline = ContinuousClock.now + timeout
        while sut.query() != expected, ContinuousClock.now < deadline {
            await Task.yield()
        }
        #expect(sut.query() == expected, sourceLocation: sourceLocation)
    }

    private struct Event: Sendable {
        let isAwaiting: Bool
    }
}

final class StateEnvelope<Event: Sendable, State: Sendable>: @unchecked Sendable {

    private let state: Mutex<State>
    private var task: Task<Void, Never>?

    init(initial: State, stream: AsyncStream<Event>, map: @escaping @Sendable (Event) -> State) {
        state = Mutex(initial)
        task = Task { [weak self] in
            for await event in stream {
                self?.state.withLock { $0 = map(event) }
            }
        }
    }

    func query() -> State {
        state.withLock { $0 }
    }

    deinit { task?.cancel() }
}
