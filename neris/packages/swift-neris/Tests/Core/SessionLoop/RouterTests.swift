import Testing

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

    private func makeUIEvent(
        _ value: String = makeSomeString()
    ) -> UIEvent {
        .init(value: value)
    }
}

private enum RouterEvent<Input: Equatable & Sendable>: Equatable, Sendable {
    case repl(Input)
    case control(Input)
}

private struct Router<Input: Equatable & Sendable> {

    let events: AsyncStream<Input>
    let expectsControl: @Sendable () -> Bool

    func run() -> AsyncStream<RouterEvent<Input>> {
        let events = events
        let expectsControl = expectsControl
        return AsyncStream { continuation in
            Task {
                for await event in events {
                    if expectsControl() {
                        continuation.yield(.control(event))
                    } else {
                        continuation.yield(.repl(event))
                    }
                }
                continuation.finish()
            }
        }
    }
}
