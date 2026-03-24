import Testing
@testable import NerisCore

final class RouterTests: TestContext {

    @Test func test_shouldRouteToREPL_onInputWhenNotExpectingControl() async throws {
        let event = makeUIEvent()
        let (input, spy) = makeSUT(expectsControl: { false })

        input.send(event)

        await spy.waitForEvents(1)
        #expect(spy.values == [Output.repl(event)])
    }

    @Test func test_shouldRouteToControl_onInputWhenExpectingControl() async throws {
        let event = makeUIEvent()
        let (input, spy) = makeSUT(expectsControl: { true })

        input.send(event)

        await spy.waitForEvents(1)
        #expect(spy.values == [Output.control(event)])
    }

    @Test func test_shouldSwitchRouting_onStateChange() async throws {
        let (task, control, resumed) = (makeUIEvent(), makeUIEvent(), makeUIEvent())
        let state = StateStub()
        let (input, spy) = makeSUT(expectsControl: { state.expectsControl })

        input.send(task)
        await spy.waitForEvents(1)

        state.expectsControl = true
        input.send(control)
        await spy.waitForEvents(2)

        state.expectsControl = false
        input.send(resumed)
        await spy.waitForEvents(3)

        #expect(spy.values == [Output.repl(task), Output.control(control), Output.repl(resumed)])
    }

    // MARK: - Helpers

    private typealias SUT = Router<UIEvent>
    private typealias Output = RouterEvent<UIEvent>

    private func makeSUT(
        expectsControl: @escaping @Sendable () -> Bool,
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (InputChannel<UIEvent>, StreamSpy<Output>) {
        let input = InputChannel<UIEvent>()
        let router = SUT(events: input.stream, expectsControl: expectsControl)
        return (input, StreamSpy<Output>(router.run()))
    }

    private struct UIEvent: Equatable, Sendable {
        let value: String
    }

    private final class StateStub: @unchecked Sendable {
        var expectsControl = false
    }

    private func makeUIEvent(
        _ value: String = makeSomeString()
    ) -> UIEvent {
        .init(value: value)
    }
}
