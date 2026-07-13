import FolioTellCore
import Testing

@MainActor
struct RxViewModelTests {

    @Test func test_event_shouldPublishReducedState_onEvent() {

        let sut = makeSUT()

        sut.event(.a)

        #expect(sut.state == TestState(processed: [.a]))
    }

    @Test func test_event_shouldHandleReducedEffect_onEffectReturningReducer() {

        var handledEffects = [TestEffect]()
        let sut = makeSUT(
            effectForEvent: { _ in .chain },
            handleEffect: { effect, _ in handledEffects.append(effect) }
        )

        sut.event(.a)

        #expect(handledEffects == [.chain])
    }

    @Test func test_event_shouldProcessDispatchedEventsInFIFOOrder_onSynchronousEffectDispatch() {

        let sut = makeSUT(
            effectForEvent: { event in
                switch event {
                case .a: .fanOut
                case .b: .chain
                case .c, .d: nil
                }
            },
            handleEffect: { effect, dispatch in
                switch effect {
                case .fanOut:
                    dispatch(.b)
                    dispatch(.c)
                case .chain:
                    dispatch(.d)
                }
            }
        )

        sut.event(.a)

        #expect(sut.state == TestState(processed: [.a, .b, .c, .d]))
    }

    // MARK: - Helpers

    private typealias SUT = RxViewModel<TestState, TestEvent, TestEffect>

    private func makeSUT(
        effectForEvent: @escaping (TestEvent) -> TestEffect? = { _ in nil },
        handleEffect: @escaping SUT.HandleEffect = { _, _ in }
    ) -> SUT {

        return SUT(
            initialState: TestState(processed: []),
            reduce: { state, event in
                (TestState(processed: state.processed + [event]), effectForEvent(event))
            },
            handleEffect: handleEffect,
            scheduler: .immediate
        )
    }
}

private struct TestState: Equatable {
    let processed: [TestEvent]
}

private enum TestEvent: Equatable {
    case a, b, c, d
}

private enum TestEffect: Equatable {
    case fanOut
    case chain
}
