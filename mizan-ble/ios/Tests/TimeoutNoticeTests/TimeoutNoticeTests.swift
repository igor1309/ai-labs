import Testing
import TimeoutNotice

struct TimeoutNoticeTests {
    @MainActor @Test func effectsCallTimerBeforeReturningEmptyStreams() async {
        let first = TimeoutNotice.Notice(number: 3)
        let next = TimeoutNotice.Notice(number: 4)
        let timer = TimerSpy()
        let handler = TimeoutNotice.EffectHandler(timer: timer)
        let cases: [(TimeoutNotice.Effect, TimerSpy.Call)] = [
            (.start(first, seconds: 30), .start(first, seconds: 30)),
            (.start(next, seconds: 17), .start(next, seconds: 17)),
            (.stop(first), .stop(first)),
            (.stop(next), .stop(next)),
        ]
        var expected: [TimerSpy.Call] = []
        for (effect, call) in cases {
            let stream = handler.handle(effect)
            expected.append(call)
            #expect(timer.calls == expected)
            var events: [TimeoutNotice.Event] = []
            for await event in stream { events.append(event) }
            #expect(events == [])
        }
    }
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
