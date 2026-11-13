import Testing
import TimeoutNotice

private let first = TimeoutNotice.Notice(number: 3)
private let next = TimeoutNotice.Notice(number: 4)

@MainActor
struct TimeoutNoticeEffectHandlerTests {
    @Test(arguments: [(first, 30), (next, 17)])
    func startStartsTheTimerForTheNotice(notice: TimeoutNotice.Notice, seconds: Int) {
        let (sut, timer) = makeSUT()

        sut.handle(.start(notice, seconds: seconds))

        #expect(timer.calls == [.start(notice, seconds: seconds)])
    }

    @Test(arguments: [first, next])
    func stopStopsTheTimerForTheNotice(notice: TimeoutNotice.Notice) {
        let (sut, timer) = makeSUT()

        sut.handle(.stop(notice))

        #expect(timer.calls == [.stop(notice)])
    }
}

// MARK: - Helpers

@MainActor
private func makeSUT() -> (TimeoutNotice.EffectHandler, TimerSpy) {
    let timer = TimerSpy()
    return (TimeoutNotice.EffectHandler(timer: timer), timer)
}

@MainActor
private final class TimerSpy: TimeoutNotice.Timer {
    enum Call: Equatable {
        case start(TimeoutNotice.Notice, seconds: Int)
        case stop(TimeoutNotice.Notice)
    }

    private(set) var calls: [Call] = []

    func start(seconds: Int, for notice: TimeoutNotice.Notice) {
        calls.append(.start(notice, seconds: seconds))
    }

    func stop(_ notice: TimeoutNotice.Notice) {
        calls.append(.stop(notice))
    }
}
